package app

import (
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLaunchProfileRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "piik-profile.json")
	room := ProfileRoom{RoomID: "1234", HostToken: strings.Repeat("a", 32), InviteURL: "https://share.test/r/1234#v=" + strings.Repeat("b", 32)}
	profile := LaunchProfile{Version: 1, Site: "https://share.test", Password: " 中文 +& private ", Room: room}
	payload, _ := json.Marshal(profile)
	if err := os.WriteFile(path, payload, 0600); err != nil {
		t.Fatal(err)
	}
	loaded, err := LoadLaunchProfile(path)
	if err != nil {
		t.Fatal(err)
	}
	entry, err := url.Parse(loaded.EntryURL(14700))
	if err != nil {
		t.Fatal(err)
	}
	fragment, err := url.ParseQuery(entry.EscapedFragment())
	if err != nil {
		t.Fatal(err)
	}
	if fragment.Get("client-access") != profile.Password || fragment.Get("piik-client") != "1" {
		t.Fatal("launch credentials or activation were not preserved")
	}
	if entry.Query().Get("client-access") != "" || entry.Query().Get("piik-room") != "" {
		t.Fatal("credentials must stay out of the HTTP query")
	}
	var decoded ProfileRoom
	if err := json.Unmarshal([]byte(fragment.Get("piik-room")), &decoded); err != nil || decoded != room {
		t.Fatal("room profile did not round trip")
	}
}

func TestLaunchProfileRejectsMismatchedSite(t *testing.T) {
	path := filepath.Join(t.TempDir(), "piik-profile.json")
	profile := LaunchProfile{Version: 1, Site: "https://share.test", Room: ProfileRoom{
		RoomID: "1234", HostToken: strings.Repeat("a", 32), InviteURL: "https://another.test/r/1234"}}
	payload, _ := json.Marshal(profile)
	if err := os.WriteFile(path, payload, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadLaunchProfile(path); err == nil {
		t.Fatal("accepted a room from another site")
	}
}
