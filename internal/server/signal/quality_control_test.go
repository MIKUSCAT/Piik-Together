package signal

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/TNTcraftHIM/Piik/internal/server/protocol"
)

func controlTestQuality() protocol.QualitySettings {
	return protocol.QualitySettings{Resolution: protocol.QualityResolution{Width: 3840, Height: 2160},
		MaxFramerate: 30, MaxBitrate: 40000000, MaxAudioBitrate: 192000, DegradationPreference: "maintain-resolution"}
}

func enableControlHost(host *testClient) {
	host.sendJSON(map[string]any{"type": "subscribe-quality-control"})
	host.sendJSON(map[string]any{"type": "signaling-challenge", "sequence": 0})
	host.next("signaling-challenge-response")
}

func TestQualityControlRequiresOwnerProofAndHostApplication(t *testing.T) {
	h := startHarness(t, harnessOptions{})
	const generation = "quality_control_generation"
	host := openClient(t, h)
	hostIdentity := authenticate(t, host, h.room, protocol.RoleHost, "quality-host-client", 1, generation, presenceOptions{roomSession: true})
	viewer := openClient(t, h)
	authenticate(t, viewer, h.room, protocol.RoleViewer, "quality-viewer-client", 1, "", presenceOptions{})
	request := func(id, token string) {
		viewer.sendJSON(protocol.RequestQualitySettingsMessage{Type: "request-quality-settings", RequestID: id,
			Token: token, ShareGeneration: generation, QualitySettings: controlTestQuality()})
	}
	request("ordinary_viewer", strings.Repeat("x", 43))
	expectMatch(t, viewer.next("quality-control-result").raw, `{"status":"forbidden"}`)
	other := h.createRoom(protocol.CodeEntryPrivate, "")
	request("other_room_owner", other.HostToken)
	expectMatch(t, viewer.next("quality-control-result").raw, `{"status":"forbidden"}`)
	request("old_host_no_support", h.room.HostToken)
	expectMatch(t, viewer.next("quality-control-result").raw, `{"status":"unavailable"}`)
	enableControlHost(host)

	request("quality_first_edit", h.room.HostToken)
	forwarded := host.next("quality-settings-request").raw
	if strings.Contains(string(forwarded), h.room.HostToken) {
		t.Fatal("owner credential was forwarded to the Host")
	}
	var forwardedMessage protocol.QualitySettingsRequestMessage
	if err := json.Unmarshal(forwarded, &forwardedMessage); err != nil || forwardedMessage.QualitySettings != controlTestQuality() {
		t.Fatalf("requested quality did not reach the Host: %s, %v", forwarded, err)
	}
	request("quality_busy_edit", h.room.HostToken)
	expectMatch(t, viewer.next("quality-control-result").raw, `{"requestId":"quality_busy_edit","status":"busy"}`)
	// An admitted viewer cannot forge the capture owner's acknowledgement.
	viewer.sendJSON(protocol.CompleteQualitySettingsMessage{Type: "complete-quality-settings", RequestID: "quality_first_edit",
		ShareGeneration: generation, Status: "applied"})
	request("quality_still_busy", h.room.HostToken)
	expectMatch(t, viewer.next("quality-control-result").raw, `{"status":"busy"}`)
	host.sendJSON(protocol.CompleteQualitySettingsMessage{Type: "complete-quality-settings", RequestID: "quality_first_edit",
		ShareGeneration: generation, Status: "applied"})
	expectMatch(t, viewer.next("quality-control-result").raw, `{"status":"failed"}`)

	request("quality_applied_edit", h.room.HostToken)
	host.next("quality-settings-request")
	host.sendJSON(protocol.SetQualitySettingsMessage{Type: "set-quality-settings", QualitySettings: controlTestQuality()})
	host.sendJSON(protocol.CompleteQualitySettingsMessage{Type: "complete-quality-settings", RequestID: "quality_applied_edit",
		ShareGeneration: generation, Status: "applied"})
	viewer.next("quality-settings")
	var applied protocol.QualityControlResultMessage
	if err := json.Unmarshal(viewer.next("quality-control-result").raw, &applied); err != nil ||
		applied.Status != "applied" || applied.QualitySettings == nil || *applied.QualitySettings != controlTestQuality() {
		t.Fatalf("missing confirmed application: %+v, %v", applied, err)
	}
	h.server.mu.Lock()
	defer h.server.mu.Unlock()
	currentHost, connected := h.store.GetConnectedHost(h.room.RoomID)
	if !connected || currentHost.PeerID != hostIdentity.PeerID || len(h.server.qualityControls) != 0 {
		t.Fatal("quality control changed Host ownership or retained a completed edit")
	}
}

func TestQualityControlRetiresWithItsShareAndDeadline(t *testing.T) {
	for _, end := range []string{"stop", "disconnect", "timeout"} {
		t.Run(end, func(t *testing.T) {
			deadlines := make(chan func(), 1)
			h := startHarness(t, harnessOptions{afterFunc: func(duration time.Duration, callback func()) func() bool {
				if duration == 15*time.Second {
					deadlines <- callback
					return func() bool { return true }
				}
				return time.AfterFunc(duration, callback).Stop
			}})
			const generation = "quality_lifetime_generation"
			host := openClient(t, h)
			authenticate(t, host, h.room, protocol.RoleHost, "quality-lifetime-host", 1, generation, presenceOptions{roomSession: true})
			enableControlHost(host)
			viewer := openClient(t, h)
			authenticate(t, viewer, h.room, protocol.RoleViewer, "quality-lifetime-viewer", 1, "", presenceOptions{})
			viewer.sendJSON(protocol.RequestQualitySettingsMessage{Type: "request-quality-settings", RequestID: "pending_quality_edit",
				Token: h.room.HostToken, ShareGeneration: generation, QualitySettings: controlTestQuality()})
			host.next("quality-settings-request")
			deadline := <-deadlines
			status := "unavailable"
			switch end {
			case "stop":
				host.sendJSON(map[string]any{"type": "stop-sharing", "shareGeneration": generation})
			case "disconnect":
				h.closeClient(host)
			case "timeout":
				deadline()
				status = "timeout"
			}
			var result protocol.QualityControlResultMessage
			if err := json.Unmarshal(viewer.next("quality-control-result").raw, &result); err != nil || result.Status != status {
				t.Fatalf("retirement = %+v, %v; want %s", result, err, status)
			}
			// A deadline that lost its stop race cannot revive the retired edit.
			deadline()
			h.server.mu.Lock()
			pending := len(h.server.qualityControls)
			h.server.mu.Unlock()
			if pending != 0 {
				t.Fatal("retired edit retained resources")
			}
		})
	}
}
