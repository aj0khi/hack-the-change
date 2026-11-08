// ProjectsView.swift — the web "Explore projects" section.

import SwiftUI
import UIKit

struct ProjectCard: View {
    let project: CommunityProject
    var onVouch: (() -> Void)?

    private var colors: (background: Color, icon: Color) {
        switch project.palette {
        case .peach: VColor.peach
        case .lilac: VColor.lilac
        case .mint: VColor.mint
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 13) {
            Image(systemName: project.systemImage)
                .font(.system(size: 18))
                .foregroundStyle(colors.icon)
                .frame(width: 44, height: 44)
                .background(colors.background, in: .rect(cornerRadius: 8))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                Text("\(project.organization) · \(project.time)".uppercased())
                    .font(.text(10, weight: .bold, relativeTo: .caption2)).tracking(0.6)
                    .foregroundStyle(VColor.meta)
                Text(project.title)
                    .font(.display(16, bold: true, relativeTo: .headline)).foregroundStyle(VColor.ink)
                    .padding(.top, 5)
                Text(project.description)
                    .font(.text(14)).foregroundStyle(VColor.projectText).padding(.top, 5)
                FlowLayout(spacing: 6) { ForEach(project.skills, id: \.self) { SkillChip(skill: $0) } }
                    .padding(.top, 12)
            }
            Spacer(minLength: 0)
            if let onVouch {
                Button(action: onVouch) {
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(VColor.arrowIcon)
                        .frame(width: 44, height: 44)
                        .background(.white, in: .rect(cornerRadius: 8))
                        .overlay { RoundedRectangle(cornerRadius: 8).strokeBorder(VColor.arrowBorder) }
                }
                .accessibilityLabel("Give a vouch for \(project.title)")
            }
        }
        .vCard(padding: 15)
    }
}

struct ProjectsView: View {
    @Binding var selection: AppTab
    @Binding var vouchTask: String
    /// Set by the lens's student pathway ("View project") to scroll to one card, like the web.
    @Binding var focusedProject: String?

    var body: some View {
        ScrollViewReader { proxy in
            VPage {
                PageHeading(overline: "Good work starts here", title: "Find your next project",
                            subtitle: "Small projects, meaningful impact, skills worth sharing.")
                HStack {
                    Label("CALGARY COMMUNITY", systemImage: "mappin")
                    Spacer()
                    Text("EXAMPLE OPPORTUNITIES")
                }
                .font(.text(10, weight: .bold, relativeTo: .caption2)).tracking(1)
                .foregroundStyle(VColor.overline)
                .padding(.top, 28).padding(.bottom, 13)
                VStack(spacing: 12) {
                    ForEach(DemoData.projects) { project in
                        ProjectCard(project: project) {
                            vouchTask = project.title
                            selection = .vouch
                        }
                        .overlay {
                            if focusedProject == project.id {
                                RoundedRectangle(cornerRadius: 12).strokeBorder(VColor.focus, lineWidth: 3)
                            }
                        }
                        .id(project.id)
                    }
                }
                Label("These opportunities are illustrative, not live listings or partner requests.", systemImage: "info.circle")
                    .font(.text(13)).foregroundStyle(VColor.noticeText)
                    .padding(13)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(VColor.tint, in: .rect(cornerRadius: 5))
                    .padding(.top, 18)
            }
            .task(id: focusedProject) {
                guard let id = focusedProject else { return }
                try? await Task.sleep(for: .milliseconds(150))   // let the cards lay out first
                withAnimation { proxy.scrollTo(id, anchor: .center) }
                if let title = DemoData.project(id: id)?.title {
                    UIAccessibility.post(notification: .announcement, argument: title)
                }
            }
        }
    }
}
