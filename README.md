# 🌱 DeFi Garden

**Discover the highest yielding DeFi opportunities across all blockchain networks.**

DeFi Garden is a modern, responsive web application that helps users find the best yield farming opportunities in the decentralized finance ecosystem. Built with React and featuring a beautiful neumorphic design, it provides real-time data from the Defillama API to present lending, staking, and liquidity pool opportunities in an intuitive, searchable interface.

[![Live Demo](https://img.shields.io/badge/Live-Demo-brightgreen?style=for-the-badge)](https://www.defi.garden)
[![MIT License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)
[![React](https://img.shields.io/badge/React-18-blue?style=for-the-badge&logo=react)](https://reactjs.org/)

## ✨ Features

### 🔍 **Smart Search & Discovery**
- **Natural Language Processing**: Type queries like "USDC yields on Base" or "best ETH staking"
- **Intelligent Autocomplete**: Context-aware token suggestions with debounced search
- **Dual Search Modes**: Token-first or Chain-first discovery workflows
- **"I'm Feeling Degen" Button**: Quick exploration of high-yield opportunities

### 🎯 **Advanced Filtering System**
- **Multi-Chain Support**: Filter across 15+ blockchain networks
- **Pool Type Categories**: Lending, LP/DEX, Staking, Yield Farming
- **TVL & APY Filters**: Set minimum thresholds for Total Value Locked and Annual Percentage Yield
- **Real-time Results**: Instant filtering with pagination support

### 📊 **Comprehensive Pool Information**
- **Detailed Pool Cards**: Symbol, protocol, chain, TVL, and APY breakdown
- **Pool Detail Pages**: In-depth analysis with historical data and risk metrics
- **Yield Calculator**: Interactive calculator for investment projections
- **Direct Protocol Access**: One-click redirects to protocol interfaces with referral tracking

### 🎨 **Modern Design & UX**
- **Neumorphic Design System**: Beautiful, tactile interface with depth and shadows
- **Dark/Light Mode**: System-aware theme switching with persistent preferences
- **Fully Responsive**: Optimized for desktop, tablet, and mobile devices
- **Smooth Animations**: Polished micro-interactions and state transitions
- **Accessibility First**: WCAG compliant with keyboard navigation support

### ⚡ **Performance & SEO**
- **Instant Loading**: No build tools, direct HTML/CSS/JS execution
- **Background Data Loading**: Non-blocking API calls for faster perceived performance
- **SEO Optimized**: Dynamic meta tags, structured data, and sitemap generation
- **PWA Ready**: Service worker support for offline functionality

## 🚀 Live Demo

Experience DeFi Garden at **[www.defi.garden](https://www.defi.garden)**

## 🛠️ Technology Stack

### Frontend
- **React 18** - Component library with hooks pattern
- **Vanilla CSS** - Custom neumorphic design system with CSS custom properties
- **ES6+ JavaScript** - Modern JavaScript with React patterns
- **Babel Standalone** - Client-side JSX transformation

### Data & APIs
- **[Defillama Yields API](https://api-docs.defillama.com/)** - Real-time DeFi pool data
- **[Defillama Protocols API](https://api-docs.defillama.com/)** - Protocol information and URLs
- **LocalStorage Caching** - Performance optimization for protocol data

### Architecture
- **Static Site Generation** - No server required, deployable anywhere
- **Client-Side Routing** - URL state management with history API
- **Component-Based Design** - Modular React components with separation of concerns

## 📁 Project Structure

```
defi-garden-neumorphic/
├── 📄 index.html              # Main HTML entry point
├── ⚛️ app.js                  # Core React application
├── 📦 PoolDetail.js           # Pool detail page component
├── 🎨 style.css               # Main stylesheet with neumorphic design
├── 🎨 pool-detail-styles.css  # Pool detail specific styles
├── 📋 package.json            # Project metadata and scripts
├── 🗺️ sitemap.xml             # SEO sitemap
├── 🤖 robots.txt              # Search engine directives
├── 📚 CLAUDE.md               # Development documentation
└── 📖 README.md               # This file
```

## 🏃‍♂️ Quick Start

### Prerequisites
- **Python 3.x** (for local development server)
- **Git** (for version control)
- **Modern Web Browser** (Chrome, Firefox, Safari, Edge)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/alex0xhodler/defi_garden.git
   cd defi_garden
   ```

2. **Start the development server**
   ```bash
   # Using Python (recommended)
   python -m http.server 8000
   
   # Or using Node.js
   npx serve .
   
   # Or using PHP
   php -S localhost:8000
   ```

3. **Open your browser**
   Navigate to `http://localhost:8000`

That's it! No build process, no dependencies to install. The application runs directly in the browser.

## 🔧 Development Guide

### Code Structure

#### **Main Application (`app.js`)**
- **Component State Management**: React hooks for all application state
- **API Integration**: Background fetching of pool and protocol data
- **Search Logic**: Natural language processing and token matching
- **Filtering System**: Multi-criteria filtering with URL state persistence
- **Theme Management**: Dark/light mode with system preference detection

#### **Pool Detail Component (`PoolDetail.js`)**
- **Detailed Pool Views**: In-depth analysis and metrics
- **Interactive Elements**: Yield calculator, protocol navigation
- **Performance Analytics**: APY breakdowns and historical context

#### **Styling System (`style.css` & `pool-detail-styles.css`)**
- **CSS Custom Properties**: Theme variables for consistent design
- **Neumorphic Components**: Depth-based shadow system
- **Responsive Breakpoints**: Mobile-first responsive design
- **Animation System**: Smooth transitions and micro-interactions

### Key Features Implementation

#### **Natural Language Search**
```javascript
// Context-aware token extraction
const parseNaturalLanguageQuery = (query, allTokens, allChains) => {
  // Position-based scoring for better token identification
  // Chain context separation ("on", "chain", "network")
  // Common token prioritization (USDC, ETH, BTC, etc.)
}
```

#### **Neumorphic Design System**
```css
/* Consistent shadow system */
:root {
  --neuro-shadow-raised: inset -2px -2px 6px var(--shadow-light), 
                         inset 2px 2px 6px var(--shadow-dark);
  --neuro-shadow-pressed: inset 2px 2px 6px var(--shadow-dark), 
                          inset -2px -2px 6px var(--shadow-light);
}
```

#### **Performance Optimizations**
- **Debounced Search**: 300ms delay prevents excessive API calls
- **Memoized Calculations**: `useMemo` for expensive filtering operations
- **Background Loading**: Non-blocking UI with progressive data loading
- **Efficient Pagination**: Client-side pagination for large datasets

### Available Scripts

```bash
# Development server
npm run dev              # Start local development server
npm run serve           # Alternative development server

# SEO & Sitemap
npm run sitemap         # Generate sitemap.xml
npm run sitemap:validate # Validate generated sitemap
```

### Environment Configuration

#### **Theme Customization**
Modify CSS custom properties in `style.css`:
```css
:root {
  --color-primary: #21808D;      # Primary brand color
  --color-background: #F0F2F5;   # Light mode background
  --color-text: #1F2937;         # Primary text color
}

[data-theme="dark"] {
  --color-background: #1F2121;   # Dark mode background
  --color-text: #F9FAFB;         # Dark mode text
}
```

#### **API Configuration**
Default APIs are configured in `app.js`:
```javascript
const YIELDS_API = 'https://yields.llama.fi/pools';
const PROTOCOLS_API = 'https://api.llama.fi/protocols';
```

## 🚀 Deployment

DeFi Garden is a static web application that can be deployed to any hosting service:

### **Recommended Platforms**
- **[Netlify](https://netlify.com)** - Automatic deployments from Git
- **[Vercel](https://vercel.com)** - Zero-configuration deployment
- **[GitHub Pages](https://pages.github.com)** - Free hosting for public repositories
- **[Cloudflare Pages](https://pages.cloudflare.com)** - Global edge deployment

### **Deployment Steps**
1. **Build artifacts** (none required - static files)
2. **Upload files** to hosting service
3. **Configure domain** and SSL certificates
4. **Set cache headers** for optimal performance

### **Performance Recommendations**
- **Enable Gzip compression** for CSS/JS files
- **Set cache headers** for static assets (1 year)
- **Use CDN** for global content delivery
- **Enable HTTP/2** for improved loading speed

## 📊 API Reference

### **Defillama Yields API**
```javascript
// Endpoint: https://yields.llama.fi/pools
// Returns: Array of pool objects with yield data

{
  pool: "unique-pool-id",
  chain: "Ethereum",
  project: "Aave",
  symbol: "USDC",
  tvlUsd: 1500000000,
  apyBase: 4.2,
  apyReward: 1.8,
  // ... additional fields
}
```

### **Defillama Protocols API**
```javascript
// Endpoint: https://api.llama.fi/protocols
// Returns: Array of protocol objects with metadata

{
  name: "Aave",
  url: "https://app.aave.com",
  description: "Decentralized lending protocol",
  // ... additional fields
}
```

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines:

### **Development Workflow**
1. **Fork the repository**
2. **Create feature branch** (`git checkout -b feature/amazing-feature`)
3. **Make changes** with clear, descriptive commits
4. **Test thoroughly** across different browsers and devices
5. **Submit pull request** with detailed description

### **Code Style Guidelines**
- **React Components**: Functional components with hooks
- **CSS**: BEM methodology with neumorphic design principles
- **JavaScript**: ES6+ features, descriptive variable names
- **Comments**: Document complex logic and business rules

### **Testing Checklist**
- [ ] Cross-browser compatibility (Chrome, Firefox, Safari, Edge)
- [ ] Responsive design on mobile, tablet, desktop
- [ ] Accessibility with keyboard navigation
- [ ] Performance with large datasets
- [ ] Theme switching functionality

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **[DeFiLlama](https://defillama.com)** - Providing comprehensive DeFi data APIs
- **[React Team](https://reactjs.org)** - Modern component library
- **DeFi Community** - Inspiration and feedback for better user experience

## 📞 Support & Contact

- **Website**: [www.defi.garden](https://www.defi.garden)
- **Issues**: [GitHub Issues](https://github.com/alex0xhodler/defi_garden/issues)
- **Discussions**: [GitHub Discussions](https://github.com/alex0xhodler/defi_garden/discussions)

---

<div align="center">

**[🌱 Explore DeFi Garden](https://www.defi.garden)** | **[📖 Documentation](https://github.com/alex0xhodler/defi_garden/wiki)** | **[🐛 Report Bug](https://github.com/alex0xhodler/defi_garden/issues)**

Made with ❤️ by the DeFi Garden team

</div>