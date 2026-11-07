//
//  VouchApp.swift
//  Vouch
//
//  Created by Farhad Alizada on 2026-11-07.
//

import SwiftUI

@main
struct VouchApp: App {
    init() {
        VFont.register()   // Manrope + DM Sans, same fonts as the website
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .preferredColorScheme(.light)   // the website is light-only
                .tint(VColor.blue)
        }
    }
}
