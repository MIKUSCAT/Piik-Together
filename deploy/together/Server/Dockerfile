FROM alpine:3.22
ARG TARGETARCH
LABEL org.opencontainers.image.source="https://github.com/MIKUSCAT/Piik-Together"
LABEL org.opencontainers.image.licenses="MIT"
RUN mkdir /app /data && chown 65532:65532 /data
WORKDIR /app
COPY --chmod=0555 bin/linux-${TARGETARCH}/piik-server /app/piik-server
COPY LICENSE THIRD-PARTY-NOTICES.txt /app/
USER 65532:65532
EXPOSE 8787/tcp 3478/udp 7882/udp
ENTRYPOINT ["/app/piik-server"]
