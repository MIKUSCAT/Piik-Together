// Command piik-app is the self-contained Piik App: it opens a
// configured Piik Site, or runs the Local room authority in-process
// (--local / --link) together with the loopback capability service and the
// native media edge. Flags select the mode; app owns every mode's
// lifecycle.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/TNTcraftHIM/Piik/internal/app"
	"github.com/TNTcraftHIM/Piik/internal/processsignal"
)

func main() {
	code := run(os.Args[1:])
	if code != 0 {
		pauseOnError()
	}
	os.Exit(code)
}

func run(args []string) int {
	var options app.Options
	var profilePath string
	flags := flag.NewFlagSet("piik-app", flag.ContinueOnError)
	flags.StringVar(&profilePath, "profile", "", "path to an owner-provisioned launch profile")
	flags.Func("site", "save and open a Piik Site origin", func(value string) error {
		options.Site = value
		options.SiteSet = true
		return nil
	})
	flags.BoolVar(&options.Local, "local", false, "use the self-contained Local room authority")
	flags.BoolVar(&options.Link, "link", false, "create one public Viewer invitation link")
	flags.BoolVar(&options.Debug, "debug", false, "save opt-in App diagnostics to rotated files")
	flags.StringVar(&options.LogDir, "log-dir", "", "diagnostic directory (overrides PIIK_LOG_DIR)")
	flags.StringVar(&options.CaptureProcess, "capture-process", "", "path to the platform native capture process")
	flags.StringVar(&options.PublicOrigin, "public-origin", "", "fixed HTTPS origin for an externally forwarded --link")
	flags.StringVar(&options.TunnelProcess, "tunnel-process", "", "path to the packaged public tunnel process")
	flags.StringVar(&options.ConfigPath, "config", "", "path to the App configuration file")
	flags.StringVar(&options.LANAddress, "lan-address", "", "LAN IPv4 address used in Local invitations")
	flags.IntVar(&options.Port, "port", app.DefaultLocalPort, "Local Piik server port")
	if err := flags.Parse(args); err != nil {
		if err == flag.ErrHelp {
			return 0
		}
		return 2
	}
	options.DisableBrowser = os.Getenv("PIIK_CLIENT_GATE_NO_BROWSER") == "true"
	explicitProfile := profilePath != ""
	if profilePath == "" {
		executable, _ := os.Executable()
		profilePath = filepath.Join(filepath.Dir(executable), "piik-profile.json")
	}
	profile, err := app.LoadLaunchProfile(profilePath)
	if err != nil && (explicitProfile || !errors.Is(err, os.ErrNotExist)) {
		reportStartupError(err)
		return 1
	}
	if profile != nil {
		options.Profile, options.Site, options.SiteSet = profile, profile.Site, true
		if options.ConfigPath == "" {
			options.ConfigPath, err = profile.ConfigPath()
			if err != nil {
				reportStartupError(err)
				return 1
			}
		}
	}

	ctx, stop := processsignal.NotifyContext(context.Background())
	defer stop()
	if profile != nil && !options.DisableBrowser {
		return runDesktop(ctx, stop, options)
	}
	if options.DisableBrowser {
		go func() {
			var input [1]byte
			if count, _ := os.Stdin.Read(input[:]); count > 0 {
				stop()
			}
		}()
	}
	if err := app.Run(ctx, options); err != nil {
		if options.DisableBrowser {
			fmt.Fprintln(os.Stderr, err)
		}
		return 1
	}
	return 0
}
