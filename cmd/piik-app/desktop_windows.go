package main

import (
	"context"
	_ "embed"
	"fmt"
	"os"
	"syscall"
	"unsafe"

	"fyne.io/systray"
	"github.com/TNTcraftHIM/Piik/internal/app"
	"github.com/TNTcraftHIM/Piik/internal/app/browser"
)

//go:embed piik.ico
var desktopIcon []byte

func reportStartupError(err error) {
	fmt.Fprintln(os.Stderr, err)
	if os.Getenv("PIIK_CLIENT_GATE_NO_BROWSER") == "true" {
		return
	}
	message, _ := syscall.UTF16PtrFromString("无法打开直播间。\n" + err.Error())
	title, _ := syscall.UTF16PtrFromString("Piik Together")
	syscall.NewLazyDLL("user32.dll").NewProc("MessageBoxW").Call(0,
		uintptr(unsafe.Pointer(message)), uintptr(unsafe.Pointer(title)), 0x10)
}

func runDesktop(ctx context.Context, stop context.CancelFunc, options app.Options) int {
	ready := make(chan string, 1)
	done := make(chan int, 1)
	options.Ready = func(target string) { ready <- target }
	systray.Run(func() {
		systray.SetIcon(desktopIcon)
		systray.SetTooltip("Piik Together")
		open := systray.AddMenuItem("打开直播间", "")
		open.Disable()
		systray.AddSeparator()
		quit := systray.AddMenuItem("退出", "")
		go func() {
			target := ""
			for {
				select {
				case target = <-ready:
					open.Enable()
				case <-open.ClickedCh:
					if err := browser.Open(target); err != nil {
						reportStartupError(err)
					}
				case <-quit.ClickedCh:
					stop()
				case <-ctx.Done():
					return
				}
			}
		}()
		go func() {
			code := 0
			if err := app.Run(ctx, options); err != nil {
				reportStartupError(err)
				code = 1
			}
			done <- code
			systray.Quit()
		}()
	}, stop)
	return <-done
}
