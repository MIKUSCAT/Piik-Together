package signal

import (
	"time"

	"github.com/TNTcraftHIM/Piik/internal/server/protocol"
)

// A room has one capture owner and at most one outstanding remote edit. The
// viewer's Host token authorizes the edit without claiming the Host session.
type pendingQualityControl struct {
	host       *session
	viewer     *session
	requestID  string
	generation string
	quality    protocol.QualitySettings
	stop       func() bool
}

func (s *Server) requestQualitySettings(sess *session, authenticated *authenticatedSession, message protocol.RequestQualitySettingsMessage) {
	reject := func(status string) {
		s.send(sess, protocol.QualityControlResultMessage{
			Type: "quality-control-result", RequestID: message.RequestID, Status: status,
		})
	}
	if authenticated.role != protocol.RoleViewer {
		reject("forbidden")
		return
	}
	if _, err := s.store.HostManagedRoom(authenticated.roomID, message.Token); err != nil {
		reject("forbidden")
		return
	}
	host, connected := s.store.GetConnectedHost(authenticated.roomID)
	if !connected {
		reject("unavailable")
		return
	}
	hostSession := s.sessionsByID[host.SessionID]
	if hostSession == nil || !hostSession.open() || !hostSession.qualityControl || hostSession.authenticated == nil ||
		hostSession.authenticated.shareGeneration != message.ShareGeneration ||
		s.shares[authenticated.roomID].generation != message.ShareGeneration {
		reject("unavailable")
		return
	}
	if s.qualityControls[authenticated.roomID] != nil {
		reject("busy")
		return
	}
	pending := &pendingQualityControl{host: hostSession, viewer: sess,
		requestID: message.RequestID, generation: message.ShareGeneration, quality: message.QualitySettings}
	roomID := authenticated.roomID
	s.qualityControls[roomID] = pending
	pending.stop = s.afterFunc(15*time.Second, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.qualityControls[roomID] == pending {
			s.finishQualityControl(roomID, "timeout")
		}
	})
	s.send(hostSession, protocol.QualitySettingsRequestMessage{
		Type: "quality-settings-request", RequestID: message.RequestID,
		ShareGeneration: message.ShareGeneration, QualitySettings: message.QualitySettings,
	})
}

func (s *Server) completeQualitySettings(sess *session, authenticated *authenticatedSession, message protocol.CompleteQualitySettingsMessage) {
	pending := s.qualityControls[authenticated.roomID]
	if authenticated.role != protocol.RoleHost || pending == nil || pending.host != sess ||
		pending.requestID != message.RequestID || pending.generation != message.ShareGeneration ||
		authenticated.shareGeneration != pending.generation {
		return
	}
	status := message.Status
	share := s.shares[authenticated.roomID]
	if share.generation != pending.generation {
		status = "unavailable"
	} else if status == "applied" && (share.qualitySettings == nil || *share.qualitySettings != pending.quality) {
		// Applying capture and publishing its settings must precede success.
		status = "failed"
	}
	s.finishQualityControl(authenticated.roomID, status)
}

func (s *Server) finishQualityControl(roomID, status string) {
	pending := s.qualityControls[roomID]
	if pending == nil {
		return
	}
	delete(s.qualityControls, roomID)
	if pending.stop != nil {
		pending.stop()
	}
	result := protocol.QualityControlResultMessage{
		Type: "quality-control-result", RequestID: pending.requestID, Status: status,
	}
	if status == "applied" {
		result.QualitySettings = &pending.quality
	}
	s.send(pending.viewer, result)
}
