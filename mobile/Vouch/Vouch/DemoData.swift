// DemoData.swift
// Same fictional projects, example credential, example job and skill keywords as the web app (app.js).

import Foundation
import SwiftUI

nonisolated struct CommunityProject: Identifiable, Hashable, Sendable {
    var id: String { title }
    let title: String
    let organization: String
    let description: String
    let skills: [String]
    let systemImage: String
    let time: String
    let palette: Palette

    nonisolated enum Palette: Sendable { case peach, lilac, mint }
}

nonisolated enum DemoData {
    static let issuerName = "Community Centre (fictional demo)"
    static let studentName = "Priya Sharma"

    /// Canada's nine Skills for Success, spelled exactly as the web form does.
    static let skills = [
        "Communication", "Digital", "Problem solving", "Collaboration", "Adaptability",
        "Writing", "Reading", "Numeracy", "Creativity and innovation",
    ]

    static let projects: [CommunityProject] = [
        CommunityProject(
            title: "Help neighbours connect online",
            organization: "Neighbourhood centre · example",
            description: "Help someone feel confident connecting with family over a video call.",
            skills: ["Communication", "Digital"], systemImage: "video", time: "1–2 hours", palette: .peach),
        CommunityProject(
            title: "Make a community spreadsheet easier",
            organization: "Community organization · example",
            description: "Organize a sign-up sheet so a small team can spend more time helping.",
            skills: ["Digital", "Problem solving"], systemImage: "tablecells", time: "2–3 hours", palette: .lilac),
        CommunityProject(
            title: "Create a simple digital guide",
            organization: "Neighbourhood centre · example",
            description: "Write clear, friendly instructions for someone learning a new tool.",
            skills: ["Writing", "Communication"], systemImage: "doc.richtext", time: "1–2 hours", palette: .mint),
    ]

    /// Signed on first launch, like the web app's fictional example.
    static let examplePayload = VouchPayload(
        title: "Help neighbours connect online",
        witness: "Doug",
        transcript: "Priya was patient and explained every step clearly. She showed me how to call my family and wrote the steps down for me.",
        issuer: issuerName,
        student: studentName,
        example: true,
        issuedAt: "2026-11-07",
        mappings: [
            SkillMapping(skill: "Communication", quote: "Priya was patient and explained every step clearly."),
            SkillMapping(skill: "Digital", quote: "She showed me how to call my family and wrote the steps down for me."),
        ])

    static let exampleJob = """
    Strong communication and interpersonal skills
    Comfort using digital tools and technology
    Experience with project management
    Ability to troubleshoot and solve problems
    """

    /// Keyword rules copied from skillTerms in app.js (the offline Employer Lens).
    static let skillTerms: [String: String] = [
        "Communication": #"\b(communicat\w*|explain\w*|present\w*|interpersonal)\b"#,
        "Digital": #"\b(digital|technology|technical|computer|software|spreadsheet\w*)\b"#,
        "Problem solving": #"\b(problem[ -]solv\w*|troubleshoot\w*)\b"#,
        "Collaboration": #"\b(collaborat\w*|teamwork|team player)\b"#,
        "Adaptability": #"\b(adaptab\w*|adapt\w*|flexib\w*)\b"#,
        "Writing": #"\b(writ\w*|documentation|document\w*)\b"#,
        "Reading": #"\b(read\w*|interpret\w*)\b"#,
        "Numeracy": #"\b(numeracy|numerical|calculat\w*|math\w*)\b"#,
        "Creativity and innovation": #"\b(creativ\w*|innovat\w*)\b"#,
    ]

    static func requirement(_ line: String, mentions skill: String) -> Bool {
        guard let pattern = skillTerms[skill],
              let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
        else { return false }
        return regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)) != nil
    }

    /// Splits a transcript into sentences, so each skill can be backed by one exact sentence.
    static func sentences(in text: String) -> [String] {
        var result: [String] = []
        text.enumerateSubstrings(in: text.startIndex..., options: .bySentences) { sub, _, _, _ in
            let trimmed = (sub ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { result.append(trimmed) }
        }
        return result.isEmpty && !text.isEmpty ? [text.trimmingCharacters(in: .whitespacesAndNewlines)] : result
    }
}
