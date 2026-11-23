package app

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"

	appconfig "github.com/TNTcraftHIM/Piik/internal/app/config"
	"github.com/TNTcraftHIM/Piik/internal/app/launcher"
	"github.com/TNTcraftHIM/Piik/internal/server/protocol"
)

// LaunchProfile is provisioned by the owner, and travels with the recipient App.
// It contains room access only; deployment credentials stay with the owner.
type LaunchProfile struct {
	Version  int                       `json:"version"`
	Site     string                    `json:"site"`
	Password string                    `json:"password"`
	Room     ProfileRoom               `json:"room"`
	Quality  *protocol.QualitySettings `json:"quality,omitempty"`
}

type ProfileRoom struct {
	RoomID    string `json:"roomId"`
	HostToken string `json:"hostToken"`
	InviteURL string `json:"inviteUrl"`
}

func LoadLaunchProfile(path string) (*LaunchProfile, error) {
	payload, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var profile LaunchProfile
	if err := json.Unmarshal(payload, &profile); err != nil {
		return nil, fmt.Errorf("invalid piik-profile.json: %w", err)
	}
	site, err := appconfig.NormalizeSite(profile.Site)
	if err != nil || site == "" || profile.Version != 1 ||
		!regexp.MustCompile(`^[1-9][0-9]{3}$`).MatchString(profile.Room.RoomID) ||
		!regexp.MustCompile(`^[A-Za-z0-9_-]{32,128}$`).MatchString(profile.Room.HostToken) {
		return nil, fmt.Errorf("invalid Piik launch profile")
	}
	invite, err := url.Parse(profile.Room.InviteURL)
	if err != nil || invite.Scheme+"://"+invite.Host != site || invite.Path != "/r/"+profile.Room.RoomID {
		return nil, fmt.Errorf("profile room must belong to its Piik site")
	}
	profile.Site = site
	return &profile, nil
}

func (profile *LaunchProfile) ConfigPath() (string, error) {
	directory, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	identity := sha256.Sum256([]byte(profile.Site + "/" + profile.Room.RoomID))
	return filepath.Join(directory, "PiikTogether", fmt.Sprintf("%x", identity[:8]), "client.json"), nil
}

func (profile *LaunchProfile) EntryURL(controlPort int) string {
	room, _ := json.Marshal(profile.Room)
	fragment := url.Values{
		"piik-room":  {string(room)},
		"piik-lang":  {"zh"},
		"piik-mode":  {"text"},
		"piik-theme": {"light"},
	}
	return launcher.LocalEntryURL(profile.Site+"/#"+fragment.Encode(), profile.Password, controlPort)
}
