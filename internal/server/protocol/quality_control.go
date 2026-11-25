package protocol

import "errors"

type SubscribeQualityControlMessage struct {
	Type string `json:"type"`
}

type RequestQualitySettingsMessage struct {
	Type            string          `json:"type"`
	RequestID       string          `json:"requestId"`
	Token           string          `json:"token"`
	ShareGeneration string          `json:"shareGeneration"`
	QualitySettings QualitySettings `json:"qualitySettings"`
}

type CompleteQualitySettingsMessage struct {
	Type            string `json:"type"`
	RequestID       string `json:"requestId"`
	ShareGeneration string `json:"shareGeneration"`
	Status          string `json:"status"`
}

type QualitySettingsRequestMessage struct {
	Type            string          `json:"type"`
	RequestID       string          `json:"requestId"`
	ShareGeneration string          `json:"shareGeneration"`
	QualitySettings QualitySettings `json:"qualitySettings"`
}

type QualityControlResultMessage struct {
	Type            string           `json:"type"`
	RequestID       string           `json:"requestId"`
	Status          string           `json:"status"`
	QualitySettings *QualitySettings `json:"qualitySettings,omitempty"`
}

func (SubscribeQualityControlMessage) isClientMessage() {}
func (RequestQualitySettingsMessage) isClientMessage()  {}
func (CompleteQualitySettingsMessage) isClientMessage() {}
func (QualitySettingsRequestMessage) isServerMessage()  {}
func (QualityControlResultMessage) isServerMessage()    {}

func decodeRequestQualitySettings(data []byte) (ClientMessage, error) {
	var message RequestQualitySettingsMessage
	present, err := decodeObject(data, &message)
	if err != nil {
		return nil, err
	}
	if err := present.require("type", "requestId", "token", "shareGeneration", "qualitySettings"); err != nil {
		return nil, err
	}
	if !ValidOpaqueID(message.RequestID) || !ValidOpaqueID(message.ShareGeneration) || !ValidToken(message.Token) {
		return nil, errors.New("invalid quality control request identity")
	}
	return message, nil
}

func decodeCompleteQualitySettings(data []byte) (ClientMessage, error) {
	var message CompleteQualitySettingsMessage
	present, err := decodeObject(data, &message)
	if err != nil {
		return nil, err
	}
	if err := present.require("type", "requestId", "shareGeneration", "status"); err != nil {
		return nil, err
	}
	if !ValidOpaqueID(message.RequestID) || !ValidOpaqueID(message.ShareGeneration) ||
		!enumOf(message.Status, "applied", "busy", "failed", "unavailable") {
		return nil, errors.New("invalid quality control completion")
	}
	return message, nil
}

func decodeQualitySettingsRequest(data []byte) (ServerMessage, error) {
	var message QualitySettingsRequestMessage
	present, err := decodeObject(data, &message)
	if err != nil {
		return nil, err
	}
	if err := present.require("type", "requestId", "shareGeneration", "qualitySettings"); err != nil {
		return nil, err
	}
	if !ValidOpaqueID(message.RequestID) || !ValidOpaqueID(message.ShareGeneration) {
		return nil, errors.New("invalid quality control request identity")
	}
	return message, nil
}

func decodeQualityControlResult(data []byte) (ServerMessage, error) {
	var message QualityControlResultMessage
	present, err := decodeObject(data, &message)
	if err != nil {
		return nil, err
	}
	if err := present.require("type", "requestId", "status"); err != nil {
		return nil, err
	}
	if err := present.optional("qualitySettings"); err != nil {
		return nil, err
	}
	if !ValidOpaqueID(message.RequestID) || !enumOf(message.Status, "applied", "busy", "failed", "unavailable", "forbidden", "timeout") ||
		(message.Status == "applied") != (message.QualitySettings != nil) {
		return nil, errors.New("invalid quality control result")
	}
	return message, nil
}
