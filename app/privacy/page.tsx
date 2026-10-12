import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'गोपनीयता नीति | पोज़ गाइड / Pose Guide',
  description: 'पोज़ फोटो ऐप में फ़ोटो, कैमरा, माइक्रोफ़ोन और AI की गोपनीयता की जानकारी।',
}

export default function PrivacyPage() {
  return (
    <main
      className="min-h-dvh bg-background text-foreground"
      style={{
        paddingTop: 'calc(1.5rem + var(--safe-area-inset-top, env(safe-area-inset-top, 0px)))',
        paddingBottom: 'calc(2rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))',
        paddingLeft: 'calc(1.25rem + var(--safe-area-inset-left, env(safe-area-inset-left, 0px)))',
        paddingRight: 'calc(1.25rem + var(--safe-area-inset-right, env(safe-area-inset-right, 0px)))',
      }}
    >
      <article className="mx-auto max-w-3xl space-y-10 text-base leading-8">
        <Link href="/" className="inline-block text-primary underline underline-offset-4">
          कैमरा पर वापस जाएँ / Back to camera
        </Link>

        <section lang="hi" aria-labelledby="privacy-hi" className="space-y-6">
          <header className="space-y-2">
            <h1 id="privacy-hi" className="text-3xl font-semibold">गोपनीयता नीति — पोज़ गाइड / Pose Guide</h1>
            <p className="text-muted-foreground">अंतिम अपडेट: <time dateTime="2026-10-12">2026-10-12</time></p>
          </header>
          <section className="space-y-2">
            <h2 className="text-xl font-semibold">अकाउंट और आपकी फ़ोटो</h2>
            <p>पोज़ गाइड / Pose Guide इस्तेमाल करने के लिए अकाउंट बनाने की ज़रूरत नहीं है। कैमरे से खींची गई फ़ोटो आपके डिवाइस पर रहती हैं; ऐप उन्हें हमारे सर्वर पर अपलोड नहीं करता। आप फ़ोटो अपने डिवाइस पर सेव कर सकते हैं। AI कॉल के दौरान भेजे जाने वाले कैमरा फ़्रेम, नीचे बताई गई अलग सुविधा हैं।</p>
          </section>
          <section className="space-y-2">
            <h2 className="text-xl font-semibold">कैमरा, माइक्रोफ़ोन और AI असिस्टेंट</h2>
            <p>कैमरा अनुमति से ऐप कैमरा दिखाता है और फ़ोटो खींचता है। AI असिस्टेंट केवल आपके खुद कॉल शुरू करने पर चालू होता है। इस दौरान माइक्रोफ़ोन की आवाज़ और कैमरे के छोटे फ़्रेम लगभग हर 1.2 सेकंड में Google Gemini को भेजे जाते हैं, ताकि वह पोज़, रोशनी और फ़्रेमिंग पर मार्गदर्शन दे सके। AI की आवाज़ आपके डिवाइस पर बजती है।</p>
            <p>आप कभी भी कॉल बंद कर सकते हैं। ऐप बैकग्राउंड में जाने या पेज छिपने पर AI कॉल बंद होती है। आप डिवाइस या ब्राउज़र की सेटिंग्स में कैमरा और माइक्रोफ़ोन की अनुमतियाँ भी बदल सकते हैं। AI के लिए भेजी गई आवाज़ और फ़्रेम Google की लागू सेवा शर्तों और गोपनीयता नीति के अनुसार संसाधित होते हैं।</p>
          </section>
          <section className="space-y-2">
            <h2 className="text-xl font-semibold">वेब एनालिटिक्स और सेवा संचालन</h2>
            <p>वेब संस्करण में वेबसाइट के उपयोग को समझने के लिए Vercel Analytics इस्तेमाल होता है। नेटिव मोबाइल ऐप में Vercel Analytics चालू नहीं है। AI कनेक्शन के लिए हमारा सर्वर एक कम समय तक चलने वाला टोकन बनाता है; दुरुपयोग सीमित करने के लिए IP पते पर आधारित अस्थायी अनुरोध गिनती रखी जाती है। असली Google API कुंजी ऐप में शामिल नहीं होती।</p>
          </section>
          <section className="space-y-2">
            <h2 className="text-xl font-semibold">बच्चे और संपर्क</h2>
            <p>यह ऐप 13 वर्ष से कम उम्र के बच्चों के लिए निर्देशित नहीं है। गोपनीयता से जुड़े सवालों के लिए संपर्क करें: <span className="break-all font-medium">{'{{CONTACT_EMAIL}}'}</span></p>
          </section>
        </section>

        <section lang="en" aria-labelledby="privacy-en" className="space-y-6 border-t border-border pt-8">
          <header className="space-y-2">
            <h2 id="privacy-en" className="text-3xl font-semibold">Privacy Policy</h2>
            <p className="text-muted-foreground">Last updated: <time dateTime="2026-10-12">2026-10-12</time></p>
          </header>
          <section className="space-y-2">
            <h3 className="text-xl font-semibold">Accounts and your photos</h3>
            <p>No account is required to use Pose Guide (पोज़ गाइड). Photos you capture stay on your device; the app does not upload them to our servers. You can save photos to your device. Camera frames sent during an AI call are a separate feature described below.</p>
          </section>
          <section className="space-y-2">
            <h3 className="text-xl font-semibold">Camera, microphone and AI assistant</h3>
            <p>Camera permission lets the app show the camera and take photos. The AI assistant starts only when you explicitly start a call. During that call, microphone audio and small camera frames approximately every 1.2 seconds are streamed to Google Gemini for guidance on poses, lighting and framing. The AI response audio plays on your device.</p>
            <p>You can stop the call at any time. The AI call disconnects when the app goes into the background or the page becomes hidden. You can also change camera and microphone permissions in your device or browser settings. Audio and frames sent for AI are processed under Google’s applicable service terms and privacy policy.</p>
          </section>
          <section className="space-y-2">
            <h3 className="text-xl font-semibold">Web analytics and service operation</h3>
            <p>The web version uses Vercel Analytics to understand website usage. Vercel Analytics is disabled in the native mobile app. Our server creates a short-lived token for AI connections and keeps temporary IP-based request counts to limit abuse. The real Google API key is not included in the app.</p>
          </section>
          <section className="space-y-2">
            <h3 className="text-xl font-semibold">Children and contact</h3>
            <p>This app is not directed to children under 13. For privacy questions, contact: <span className="break-all font-medium">{'{{CONTACT_EMAIL}}'}</span></p>
          </section>
        </section>
      </article>
    </main>
  )
}
