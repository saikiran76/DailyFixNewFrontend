# DailyFix - Unified Messaging Platform

DailyFix is a modern, unified messaging platform that connects multiple messaging services (WhatsApp, Telegram, and more) into a single, intuitive interface. Built with React and powered by Matrix protocol, it provides a seamless experience for managing conversations across different platforms.

## Features

- **Multi-Platform Integration**: Connect and manage WhatsApp, Telegram, and other messaging platforms from a single interface
- **Real-Time Messaging**: Send and receive messages in real-time across all connected platforms
- **Unified Contact Management**: View and organize all your contacts in one place
- **Media Sharing**: Share images, videos, and documents seamlessly
- **Responsive Design**: Works on desktop and mobile devices with an adaptive interface
- **Dark/Light Theme**: Choose between dark and light themes for comfortable viewing
- **Secure Authentication**: Google Sign-In and robust session management

## Technical Architecture

### Frontend (React)

- **State Management**: Redux with Redux Toolkit for global state management
- **Routing**: React Router for navigation
- **UI Components**: Custom components with Tailwind CSS for styling
- **Authentication**: Supabase Auth with JWT token management
- **API Communication**: Axios for API requests with interceptors for token refresh
- **Real-Time Updates**: Matrix SDK for real-time messaging capabilities

### Backend Integration

- **Matrix Protocol**: Uses Matrix as the underlying protocol for message handling
- **Matrix Bridges**: Connects to WhatsApp and Telegram via Matrix bridges
- **API Layer**: RESTful API for platform-specific operations
- **Authentication**: JWT-based authentication with secure token refresh

### Key Technical Components

#### Matrix Integration

The application uses the Matrix protocol as its backbone, leveraging:

- **MatrixClientContext**: Provides Matrix client instance to components
- **SlidingSyncManager**: Efficiently syncs Matrix rooms and messages
- **Matrix Bridges**: Connects to WhatsApp and Telegram through dedicated bridges

#### Platform Isolation

Each messaging platform is isolated to ensure proper functionality:

- **WhatsApp**: Connected through backend Matrix service
- **Telegram**: Connected through frontend Matrix client
- **Platform-Specific Components**: Dedicated components for each platform's unique features

#### Authentication System

Robust authentication with multiple layers of protection:

- **Token Management**: Sophisticated token refresh mechanism with fallbacks
- **Session Monitoring**: Proactive session checks and graceful expiration handling
- **Secure Storage**: Multiple storage locations for authentication data
- **Session Expiry Handling**: User-friendly session expiration with modal notifications

## Getting Started

### Prerequisites

- Node.js (v14+)
- npm or yarn
- Access to Matrix homeserver (for development)

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/dailyfix.git
   cd dailyfix
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file with the following variables:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_MATRIX_SERVER_URL=your_matrix_server_url
   ```

4. Start the development server:
   ```
   npm run dev
   ```
