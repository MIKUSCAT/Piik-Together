//go:build !windows

package main

import (
	"context"
	"fmt"
	"github.com/TNTcraftHIM/Piik/internal/app"
	"os"
)

func reportStartupError(err error) { fmt.Fprintln(os.Stderr, err) }

func runDesktop(ctx context.Context, stop context.CancelFunc, options app.Options) int {
	defer stop()
	if err := app.Run(ctx, options); err != nil {
		reportStartupError(err)
		return 1
	}
	return 0
}
