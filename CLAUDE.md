# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DeFi Garden is a React-based web application that helps users discover the highest yielding DeFi opportunities across all blockchain networks. The app uses a neumorphic design system with real-time data from the Defillama API to present yield farming opportunities in an intuitive, searchable interface.

## Architecture

### Frontend Stack
- **React 18** - Using vanilla React with Babel transformation (no build tools)
- **Pure CSS** - Comprehensive neumorphic design system with CSS custom properties
- **Vanilla JavaScript** - ES6+ with React hooks pattern
- **External APIs** - Defillama yields API for real-time DeFi data

### Key Components
- `App` component handles all application state and logic
- Token search with intelligent autocomplete and debouncing
- Dynamic filtering system (chain, TVL, APY)
- Paginated results with neumorphic card design
- Protocol URL mapping for direct access to DeFi platforms

### Data Flow
1. Fetches pool data from `https://yields.llama.fi/pools` on mount
2. Processes and normalizes token symbols for search
3. Smart filtering with multiple criteria (token, chain, TVL, APY)
4. Results sorted by total APY (base + reward) descending
5. Pagination and direct protocol linking

## Development Commands

Since this is a pure HTML/CSS/JS project with no package.json, development is straightforward:

### Running the Application
```bash
# Serve locally using any HTTP server
python -m http.server 8000
# or
npx serve .
# or simply open index.html in a browser
```

### Development Workflow
1. Edit files directly in your editor
2. Refresh browser to see changes
3. Use browser DevTools for debugging
4. Test responsiveness across devices

## File Structure

```
/
├── index.html          # Main HTML file with React setup
├── app.js             # Main React component and application logic
├── style.css          # Comprehensive neumorphic design system
├── settings.local.json # Claude Code permissions and settings
└── commands/          # AI-assisted development commands
    ├── plan.md
    ├── ai-review.md
    └── [23 other command files]
```

## Code Patterns and Conventions

### React Patterns
- Use `React.createElement()` for all components (no JSX)
- Custom hooks like `useDebounce` for performance optimization
- Functional components with hooks exclusively
- Memoized computations using `useMemo` for expensive operations

### State Management
- Local state with `useState` for all application data
- Derived state through `useMemo` and `useEffect`
- Debounced search input to prevent excessive API calls
- Centralized error handling and loading states

### Styling Architecture
- CSS custom properties for theming and consistency
- Neumorphic design system with raised/pressed shadow states
- Responsive design with mobile-first approach
- Dark/light mode support through CSS custom properties

### API Integration
- Single API endpoint: `https://yields.llama.fi/pools`
- Error handling with user-friendly messages
- Loading states during data fetching
- Protocol URL mapping for external navigation

## Key Features

### Search and Filtering
- **Token Search**: Smart autocomplete with exact matches, starts-with, and contains logic
- **Chain Filtering**: Dynamic dropdown based on selected token
- **TVL Filtering**: Minimum Total Value Locked thresholds
- **APY Filtering**: Minimum Annual Percentage Yield requirements

### User Experience
- **Keyboard Navigation**: Arrow keys, Enter, Escape support in autocomplete
- **Visual Feedback**: Neumorphic pressed/raised states
- **Responsive Design**: Works across desktop, tablet, and mobile
- **Accessibility**: Focus states, proper ARIA labels, semantic HTML

### Performance Optimizations
- Debounced search (300ms delay)
- Memoized token processing and filtering
- Efficient pagination to handle large datasets
- Client-side caching of API responses

## AI-Assisted Development

This project includes 23 AI command files in the `/commands` directory for development workflows:

### Key Commands
- `/plan` - Technical specification and architecture planning
- `/ai-review` - Comprehensive code review and security analysis
- `/security-gate` - Security vulnerability scanning
- `/performance-baseline` - Performance monitoring setup
- `/observability-check` - Monitoring and alerting validation

### Usage Pattern
The commands follow a production-grade development workflow emphasizing:
- Zero technical debt tolerance
- Security-first development
- Comprehensive testing strategies
- Performance optimization
- AI-enhanced code quality

## Testing Strategy

Since this is a client-side only application:
- Manual testing across different browsers
- Responsive design testing on various screen sizes
- API error handling verification
- Performance testing with large datasets
- Accessibility testing with screen readers

## Deployment

This is a static web application that can be deployed to:
- GitHub Pages
- Netlify
- Vercel
- Any static hosting service
- CDN with proper CORS headers

Simply upload the files to your hosting provider - no build process required.

## Performance Considerations

- **Debounced Search**: Prevents excessive API calls during typing
- **Smart Filtering**: Client-side filtering after initial API fetch
- **Pagination**: Handles large datasets efficiently
- **Memoization**: Expensive computations cached appropriately
- **Lazy Loading**: Only load data when needed

## Security Notes

- API calls made to trusted Defillama endpoints only
- No user data collection or storage
- External links opened with `noopener,noreferrer`
- Input sanitization for search queries
- No eval() or dangerous dynamic code execution

## Browser Compatibility

- Modern browsers supporting ES6+ features
- CSS Grid and Flexbox support required
- CSS Custom Properties for theming
- Fetch API for network requests
- Modern React 18 features