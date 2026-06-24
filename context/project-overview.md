# [Project Name]

## Overview

This application is a voice-driven conversational AI agent designed to provide foundational psychological guidance and emotional support, fostering mental clarity and stress reduction.

⚠️ Scope Boundary: The system operates strictly as a complementary wellbeing tool and is never intended to replace human mental health professionals.

## Goals

1. Session Initiation: Allow authenticated users with a valid subscription to start a voice therapy session.
2. Session History: Allow authenticated users to view the details and audio of all past sessions, ordered chronologically by date and time.
3. Journaling: Allow authenticated users to write and maintain a personal diary.
4. Diary Details: Allow authenticated users to view the full details of a specific diary entry by selecting it from a chronological list.
5. AI Insights: Implement an AI system to detect repetitive behavioral patterns within the user's diary entries and display these insights on the dashboard.
6. Mood Tracking: Enable users to log their daily mood directly from the dashboard by selecting their corresponding mood icon.

## Core User Flow

1. Authentication & Subscription Check
The user signs into the application. The system performs a backend check to verify that the user has an active and valid subscription before rendering or enabling the session controls.
2. Initialization & Permissions
The user navigates to the dashboard and clicks the "Start Voice Session" button. The frontend application triggers a browser prompt requesting explicit access to the user's microphone.
3. Connection & Handshake
The application establishes a real-time connection with the server or AI voice streaming service via a low-latency protocol (such as WebSockets or WebRTC). The UI transitions to a "Connected & Recording" visual state.
4. Live Session Engagement
The user speaks and interacts during the therapy session. The client-side application captures the audio data streams in localized buffers, preparing them for smooth transmission or final assembly.
5. Session Termination
The user clicks the "End Session" button. The frontend immediately halts microphone capture, closes the active socket connection, and displays a processing/loading state to prevent further user interaction.
6. Backend Processing & Storage
The backend receives the definitive audio file, processes it, and uploads it securely to an object storage bucket (e.g., AWS S3 or Google Cloud Storage). A database record is created containing the secure URL reference and precise timestamps.
7. State Synchronization & Redirection
The user is automatically redirected to the session history view. The application invalidates the previous query cache or updates the local reactive state, positioning the newly completed session at the very top of the chronological list.

## Features

### Authintication

- User register and email verification.
- User on boarding questions to gather important data.
- User login

### Subscription

- User subscription
- One free session, 1 session a week subscription, 3 sessions a week subscription, 5 sessions a week subscription.

### Voice Session

- Voice therapy session.
- List of history sessions.
- Details of session with transcript and the audio of the session.

### Written Diary

- Voice therapy session.
- List of diary entries.
- Details of diary entry.

### Dashboard

- User top 3 repetitive behavioral patterns.
- Daily mood.
- Last Session overview.

### Home Page

- Non login home page.

## Scope

### In Scope

- AI bidirectional voice therapy session hands free.
- List of past sessions.
- Details of session, transciption and audio player to listen to the session.
- Write in his personal dairy.
- List of past diary entries.
- Details of dairy entry.
- AI detect repetitive behavioral patterns within the user's diary entries
- AI generates an brief overview of the last session.
- Persist storage for data and audio.

### Out of Scope

- AI talks about math, coding or any other thing is not psychological therapy session.

## Success Criteria

1. A new user can register, verify their email, complete
   onboarding questions, and sign in successfully.
2. The backend rejects starting a voice session for users
   without an active, valid subscription, and the session
   controls reflect the user's remaining session quota
   (free, 1, 3, or 5 sessions per week).
3. A subscribed user can grant microphone access, start a
   hands-free bidirectional voice therapy session, and the
   UI accurately reflects the connection state
   (connecting, connected/recording, processing).
4. On ending a session, the audio is securely persisted to
   object storage and a database record is created with a
   valid URL reference and timestamps; the user is
   redirected to the history view with the new session at
   the top of the chronological list.
5. A user can open any past session and view its transcript
   alongside a working audio player that plays back the
   recorded session.
6. A user can create, save, list (chronologically), and
   open the full details of personal diary entries.
7. The dashboard displays the user's top 3 repetitive
   behavioral patterns detected from diary entries, an
   AI-generated overview of the last session, and the
   user's daily mood once logged.
8. A user can log their daily mood from the dashboard by
   selecting a mood icon, and the selection is persisted.
9. The AI agent stays within scope: it engages with
   psychological wellbeing topics and declines off-topic
   requests (e.g. math, coding) while reinforcing that it
   complements, not replaces, professional care.
