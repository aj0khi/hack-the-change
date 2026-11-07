// SpeechCapture.swift
// Voice vouching. Uses Apple's on-device speech recognition when the device supports it,
// so the witness's audio never leaves the phone. Nothing is recorded or stored; only the text is kept.

import AVFoundation
import Observation
import Speech

/// Audio and recognition callbacks run on background threads, so this helper is
/// deliberately nonisolated (the project's default isolation is the main actor).
nonisolated final class SpeechEngine: @unchecked Sendable {
    private let audioEngine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-CA"))

    var supportsOnDevice: Bool { recognizer?.supportsOnDeviceRecognition ?? false }

    static func requestPermissions() async -> Bool {
        let speech = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0 == .authorized) }
        }
        let microphone = await AVAudioApplication.requestRecordPermission()
        return speech && microphone
    }

    func start(onText: @escaping @Sendable (String) -> Void, onEnd: @escaping @Sendable (String?) -> Void) throws {
        guard let recognizer, recognizer.isAvailable else {
            throw NSError(domain: "Vouch", code: 1, userInfo: [NSLocalizedDescriptionKey: "Speech recognition is not available right now."])
        }
        stop()
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: .duckOthers)
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition
        self.request = request

        let input = audioEngine.inputNode
        input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in
            request.append(buffer)
        }
        audioEngine.prepare()
        try audioEngine.start()

        task = recognizer.recognitionTask(with: request) { result, error in
            if let result { onText(result.bestTranscription.formattedString) }
            if error != nil || result?.isFinal == true {
                onEnd(error == nil ? nil : "Voice input stopped. You can try again or type instead.")
            }
        }
    }

    func stop() {
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

/// The view-facing side: holds the live transcript for SwiftUI.
@Observable
final class SpeechCapture {
    var isRecording = false
    var liveText = ""
    var status = ""
    @ObservationIgnored private let engine = SpeechEngine()

    var privacyNote: String {
        engine.supportsOnDevice
            ? "Speech is turned into text on this device. Audio is not sent anywhere or saved."
            : "This device can't transcribe offline, so Apple's speech service will process the audio. You can type instead."
    }

    func toggle(appendTo text: @escaping (String) -> Void) {
        isRecording ? stop() : start(appendTo: text)
    }

    @ObservationIgnored private var onFinish: ((String) -> Void)?

    private func start(appendTo text: @escaping (String) -> Void) {
        onFinish = text
        liveText = ""
        Task {
            guard await SpeechEngine.requestPermissions() else {
                status = "Microphone or speech permission is off. Turn it on in Settings, or type your words."
                return
            }
            do {
                try engine.start(
                    onText: { [weak self] value in Task { @MainActor in self?.liveText = value } },
                    onEnd: { [weak self] message in Task { @MainActor in self?.finish(message) } })
                isRecording = true
                status = "Listening… tap again when you're done."
            } catch {
                status = error.localizedDescription
            }
        }
    }

    func stop() { finish(nil) }

    private func finish(_ message: String?) {
        guard isRecording else { return }
        engine.stop()
        isRecording = false
        let spoken = liveText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !spoken.isEmpty { onFinish?(spoken) }
        liveText = ""
        status = message ?? "Please read your words and fix anything that's wrong."
    }
}
