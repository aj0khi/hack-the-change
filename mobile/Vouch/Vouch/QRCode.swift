// QRCode.swift
// Turns a credential or issuer string into a QR image, so it can be shared with the web app or another phone.

import CoreImage
import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit

enum QRCode {
    static func image(for text: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 10, y: 10)),
              let cgImage = CIContext().createCGImage(output, from: output.extent)
        else { return nil }
        return UIImage(cgImage: cgImage)
    }
}

struct QRCodeView: View {
    let text: String
    let label: String

    var body: some View {
        if let image = QRCode.image(for: text) {
            Image(uiImage: image)
                .interpolation(.none)
                .resizable()
                .scaledToFit()
                .frame(maxWidth: 280)
                .padding(12)
                .background(.white, in: .rect(cornerRadius: 12))
                .accessibilityLabel(label)
        } else {
            Text("Could not make a QR code.").foregroundStyle(.secondary)
        }
    }
}
