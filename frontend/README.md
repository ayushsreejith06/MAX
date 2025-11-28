# Stock Brokerage UI - Redesign

A professional stock brokerage interface built with Next.js, React, and TypeScript, matching the Figma design specifications exactly.

## Features

- **Dashboard**: Overview of all market sectors with scrollable carousel and detailed charts
- **Line Charts**: Segment-based dynamic coloring (green for upward trends, red for downward)
  - Adjustable time increments (5, 10, 15, 30, 60 minutes)
  - Configurable window sizes (1, 2, 4, 6, 12, 24 hours)
  - Navigation controls for time windows
- **Discussions**: Terminal-style interface with color-coded agent names
  - Tabular layout with filtering by status and sector
  - Expandable conversation histories
  - Professional terminal aesthetic

## Color Scheme

- `#06070E` - Pure black (backgrounds)
- `#7FB069` - Sage green (primary/upward trends)
- `#036016` - Dark emerald (accents)
- `#FFF8F0` - Floral white (text)
- `#262730` - Shadow grey (cards/borders)
- `#EF4444` - Red (downward trends)

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
├── app/                    # Next.js app directory
│   ├── layout.tsx         # Root layout with navbar
│   ├── page.tsx           # Dashboard page
│   └── discussions/       # Discussions page
├── components/            # React components
│   ├── Dashboard.tsx      # Main dashboard
│   ├── LineChart.tsx      # Chart component with settings
│   ├── DiscussionsPage.tsx # Discussions interface
│   └── Navbar.tsx         # Navigation bar
├── lib/                   # Utilities and shared logic
│   ├── api.ts            # Backend fetch helpers
│   └── types.ts          # Shared TypeScript contracts
└── styles/                # Global styles
    └── globals.css        # CSS with color tokens
```

## Technologies

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- Recharts (for line charts)
- Lucide React (for icons)

