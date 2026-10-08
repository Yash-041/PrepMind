# PrepMind AI Phase 1

## Product
PrepMind AI is a chat-first IIT/JEE preparation MVP with three primary tools: AI Chatbot, Daily 20 Questions, and Exam Simulator.

## Data model
- `chats`: demo-user chat metadata with string `id`, title, created/updated timestamps.
- `messages`: chat-linked user and assistant messages with string `id` and timestamps.
- Daily 20 and exam questions are static demo data in the frontend for Phase 1; session state is local to the current browser session.

## Key flows
- Chat: create a chat, send a Physics/Chemistry/Mathematics or general question, receive a subject-aware mock tutor response, refresh, and reopen from Recent Chats.
- Daily 20: answer demo JEE questions, move between questions, submit, and view score/accuracy/subject performance.
- Exam Simulator: configure a demo exam, start a timed question session, navigate with palette, answer/mark questions, submit, and view analysis.
- Supporting pages: progress, profile, settings, login/signup demo screens. The header avatar opens the profile. Students can edit and locally persist their name, target exam (JEE Main or JEE Advanced), and current class (Class 11, Class 12, or Class 12 pass-out). Password editing is opt-in inside the profile editor and requires current, new, and confirm values. Forgot password opens a dedicated registered-email form; a valid submission creates a browser-local, one-time 15-minute reset token. **EMAIL DELIVERY IS MOCKED**: the check-email page exposes the link as a demo inbox. The reset page never shows its form without the valid token link and consumes the token after use.
- Every password and password-confirmation field includes an independent accessible show/hide control.

## Auth
No real authentication in Phase 1. Signup locally saves the student's name, registered email, target exam, current class, and chosen password, then opens the app. Login accepts that browser-local demo account (or the documented defaults before signup), stores a local demo-session marker, and opens the app. The app uses a `demo-user` identity for chat persistence.