// Standalone PoolDetail Component - Full Version
const { useState } = React;

function PoolDetail({ 
  pool, 
  onBack, 
  calculateYields, 
  formatCurrency, 
  formatAPY,
  getProtocolUrl,
  getProtocolUrlWithRef,
  isDarkMode 
}) {
  const [investmentAmount, setInvestmentAmount] = useState(1000);
  const [showAPYBreakdown, setShowAPYBreakdown] = useState(false);
  const [calculatorExpanded, setCalculatorExpanded] = useState(true);
  const [poolInfoExpanded, setPoolInfoExpanded] = useState(false);
  const [activeCalculatorTab, setActiveCalculatorTab] = useState('30days');
  
  if (!pool) {
    return React.createElement('div', { className: 'pool-detail-empty' },
      React.createElement('p', null, 'No pool selected'),
      React.createElement('button', { 
        className: 'back-button',
        onClick: onBack 
      }, '← Back to results')
    );
  }
  
  const totalApy = (pool.apyBase || 0) + (pool.apyReward || 0);
  const yields = calculateYields(investmentAmount, totalApy);
  const protocolUrl = getProtocolUrl(pool);
  const protocolUrlWithRef = getProtocolUrlWithRef(pool);
  
  // Determine pool type (must be defined before getRiskAssessment)
  const getPoolType = () => {
    if (!pool.project) return 'Yield Farming';
    
    const projectName = pool.project.toLowerCase();
    
    if (pool.poolMeta && pool.poolMeta.toLowerCase().includes('lending')) {
      return 'Lending';
    }
    
    const lendingProtocols = ['aave', 'compound', 'morpho', 'spark', 'maple', 'euler', 'radiant'];
    const dexProtocols = ['uniswap', 'curve', 'balancer', 'pancakeswap', 'sushiswap'];
    const stakingProtocols = ['lido', 'rocket-pool', 'ether.fi', 'jito', 'marinade'];
    
    if (lendingProtocols.some(p => projectName.includes(p))) return 'Lending';
    if (dexProtocols.some(p => projectName.includes(p))) return 'LP/DEX';
    if (stakingProtocols.some(p => projectName.includes(p))) return 'Staking';
    
    return 'Yield Farming';
  };
  
  const poolType = getPoolType();
  
  // Comprehensive Risk Assessment
  const getRiskAssessment = () => {
    let riskScore = 0;
    const factors = [];
    
    // TVL Factor (40% weight)
    if (pool.tvlUsd < 1000000) {
      riskScore += 40;
      factors.push('Low liquidity');
    } else if (pool.tvlUsd < 10000000) {
      riskScore += 20;
      factors.push('Medium liquidity');
    } else {
      factors.push('High liquidity');
    }
    
    // APY Factor (30% weight) - Higher APY = Higher risk
    if (totalApy > 50) {
      riskScore += 30;
      factors.push('Very high yield');
    } else if (totalApy > 20) {
      riskScore += 20;
      factors.push('High yield');
    } else if (totalApy > 10) {
      riskScore += 10;
      factors.push('Elevated yield');
    }
    
    // Pool Age/Maturity Factor (20% weight)
    const isNewProtocol = ['jito', 'ether.fi', 'pendle', 'eigenlayer'].some(p => 
      pool.project?.toLowerCase().includes(p)
    );
    if (isNewProtocol) {
      riskScore += 15;
      factors.push('Newer protocol');
    }
    
    // Pool Type Factor (10% weight)
    if (poolType === 'LP/DEX') {
      riskScore += 10;
      factors.push('Impermanent loss risk');
    } else if (poolType === 'Lending') {
      riskScore += 5;
      factors.push('Credit risk');
    }
    
    // Determine overall risk level
    let level, color, description;
    if (riskScore <= 25) {
      level = 'Low';
      color = 'var(--color-success)';
      description = 'Conservative DeFi strategy';
    } else if (riskScore <= 50) {
      level = 'Medium';
      color = 'var(--color-warning)';
      description = 'Moderate risk profile';
    } else {
      level = 'High';
      color = 'var(--color-error)';
      description = 'Advanced DeFi strategy';
    }
    
    return { level, color, description, factors, score: riskScore };
  };
  
  const riskAssessment = getRiskAssessment();
  
  return React.createElement('div', { 
    className: 'pool-detail-container',
    style: { 
      opacity: 1, 
      display: 'block', 
      visibility: 'visible',
      position: 'relative',
      minHeight: '100vh',
      padding: '40px 20px 20px 20px',
      maxWidth: '1200px',
      margin: '0 auto'
    }
  },
    // Clean Header: Logo | Breadcrumb | Toggle
    React.createElement('div', { 
      className: 'header animate-on-mount',
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 0 24px 0',
        marginBottom: '24px'
      }
    },
      // Left: DeFi Garden Logo
      React.createElement('h1', { 
        className: 'logo',
        style: {
          fontSize: 'var(--font-size-xl)',
          fontWeight: 'var(--font-weight-black)',
          color: 'var(--color-text)',
          margin: 0,
          cursor: 'pointer',
          transition: 'color 0.2s ease'
        },
        onClick: () => window.location.reload(),
        onMouseEnter: (e) => e.target.style.color = 'var(--color-primary)',
        onMouseLeave: (e) => e.target.style.color = 'var(--color-text)'
      }, 'DeFi Garden'),
      
      // Center: Breadcrumb Navigation
      React.createElement('div', {
        className: 'pool-breadcrumb',
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '8px 20px',
          background: 'var(--color-background)',
          borderRadius: '20px',
          boxShadow: 'var(--neuro-shadow-pressed)',
          fontSize: 'var(--font-size-sm)',
          fontWeight: 'var(--font-weight-medium)',
          color: 'var(--color-text)'
        }
      },
        React.createElement('span', { 
          style: { 
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            transition: 'color 0.2s ease'
          },
          onClick: onBack,
          onMouseEnter: (e) => e.target.style.color = 'var(--color-primary)',
          onMouseLeave: (e) => e.target.style.color = 'var(--color-text-secondary)'
        }, 'Search Results'),
        React.createElement('span', { 
          style: { 
            color: 'var(--color-primary)'
          } 
        }, '→'),
        React.createElement('span', { 
          style: { 
            color: 'var(--color-text)',
            fontWeight: 'var(--font-weight-semibold)'
          } 
        }, `${pool.symbol} Pool`)
      ),
      
      // Right: Empty space for real toggle
      React.createElement('div', { style: { width: '100px' } })
    ),
    
    // Hero Section - Simplified and Focused
    React.createElement('div', { 
      className: 'pool-hero-card',
      style: {
        background: 'var(--color-background)',
        borderRadius: '24px',
        padding: '32px',
        boxShadow: 'var(--neuro-shadow-raised)',
        marginBottom: '24px',
        position: 'relative',
        overflow: 'hidden'
      }
    },
      // Subtle gradient overlay
      React.createElement('div', {
        style: {
          position: 'absolute',
          top: 0,
          right: 0,
          width: '40%',
          height: '100%',
          background: 'linear-gradient(90deg, transparent 0%, rgba(16, 185, 129, 0.03) 100%)',
          pointerEvents: 'none'
        }
      }),
      
      // Main Hero Content
      React.createElement('div', {
        className: 'pool-hero-content',
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          position: 'relative',
          zIndex: 1
        }
      },
        // Left side - Pool info
        React.createElement('div', { className: 'pool-info-section' },
          React.createElement('h1', { 
            className: 'pool-symbol-hero',
            style: {
              fontSize: 'var(--font-size-4xl)',
              fontWeight: '900',
              color: 'var(--color-text)',
              marginBottom: '8px',
              fontFamily: 'monospace',
              lineHeight: '1.1'
            }
          }, pool.symbol),
          
          React.createElement('div', { 
            className: 'pool-meta-simplified',
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '16px',
              fontSize: 'var(--font-size-lg)',
              color: 'var(--color-text-secondary)'
            }
          },
            React.createElement('span', { 
              className: 'protocol-name',
              style: { 
                color: 'var(--color-text)',
                fontWeight: 'var(--font-weight-semibold)'
              }
            }, pool.project),
            React.createElement('span', { className: 'separator' }, '•'),
            React.createElement('span', { 
              className: 'chain-name',
              style: { color: 'var(--color-primary)' }
            }, pool.chain)
          ),
          
          React.createElement('div', { 
            className: 'pool-type-badge-hero',
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              background: 'var(--color-background)',
              color: 'var(--color-primary)',
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-medium)',
              boxShadow: 'var(--neuro-shadow-pressed)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }
          }, poolType),
          
          // Trust indicators
          React.createElement('div', {
            className: 'trust-indicators',
            style: {
              display: 'flex',
              gap: '8px',
              marginTop: '16px'
            }
          },
            React.createElement('div', {
              className: 'trust-badge',
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                background: 'var(--color-background)',
                borderRadius: '12px',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-success)',
                boxShadow: 'var(--neuro-shadow-pressed)'
              }
            }, '✓ Verified'),
            React.createElement('div', {
              className: 'tvl-badge',
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 8px',
                background: 'var(--color-background)',
                borderRadius: '12px',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-secondary)',
                boxShadow: 'var(--neuro-shadow-pressed)'
              }
            }, formatCurrency(pool.tvlUsd) + ' TVL')
          )
        ),
        
        // Right side - APY and CTA
        React.createElement('div', { 
          className: 'apy-cta-section',
          style: {
            textAlign: 'right',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '16px'
          }
        },
          React.createElement('div', {
            className: 'apy-display-hero',
            style: {
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              padding: '20px 24px',
              background: 'var(--color-background)',
              borderRadius: '16px',
              boxShadow: 'var(--neuro-shadow-pressed)',
              minWidth: '200px'
            }
          },
            React.createElement('div', {
              style: {
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                marginBottom: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontWeight: 'var(--font-weight-medium)'
              }
            }, 'Total APY'),
            React.createElement('div', {
              className: 'apy-value-hero',
              style: {
                fontSize: 'var(--font-size-3xl)',
                fontWeight: '900',
                background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-forest) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                lineHeight: '1.1',
                marginBottom: (pool.apyBase > 0 && pool.apyReward > 0) ? '6px' : '0'
              }
            }, formatAPY(pool.apyBase, pool.apyReward)),
            
            // APY Breakdown when both base and reward exist
            (pool.apyBase > 0 && pool.apyReward > 0) && React.createElement('div', {
              style: {
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-secondary)',
                textAlign: 'right',
                lineHeight: '1.3'
              }
            },
              React.createElement('div', null, `${pool.apyBase.toFixed(1)}% Base`),
              React.createElement('div', null, `+ ${pool.apyReward.toFixed(1)}% Rewards`)
            )
          ),
          
          protocolUrlWithRef && React.createElement('div', {
            style: {
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '8px'
            }
          },
            React.createElement('button', {
              className: 'cta-button-primary',
              onClick: () => window.open(protocolUrlWithRef, '_blank', 'noopener,noreferrer'),
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '14px 28px',
                background: 'var(--color-primary)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: 'var(--font-size-base)',
                fontWeight: 'var(--font-weight-bold)',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                boxShadow: 'var(--neuro-shadow-raised)',
                position: 'relative',
                overflow: 'hidden'
              }
            },
              React.createElement('span', null, `Start Earning on ${pool.project}`),
              React.createElement('span', {
                className: 'arrow',
                style: {
                  transition: 'transform 0.2s ease'
                }
              }, '↗')
            ),
            React.createElement('div', {
              style: {
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-secondary)',
                textAlign: 'right',
                lineHeight: '1.3'
              }
            }, 'Opens protocol • Wallet required')
          )
        )
      )
    ),
    
    // Quick Metrics - Simplified 3-card layout
    React.createElement('div', { 
      className: 'quick-metrics',
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '16px',
        marginBottom: '40px'
      }
    },
      React.createElement('div', { 
        className: 'metric-card-simple',
        style: {
          background: 'var(--color-background)',
          borderRadius: '16px',
          padding: '20px',
          boxShadow: 'var(--neuro-shadow-subtle)',
          textAlign: 'center',
          transition: 'all 0.3s ease'
        }
      },
        React.createElement('div', {
          style: {
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-secondary)',
            marginBottom: '8px',
            fontWeight: 'var(--font-weight-medium)'
          }
        }, `Daily ($${investmentAmount.toLocaleString()})`),
        React.createElement('div', {
          style: {
            fontSize: 'var(--font-size-xl)',
            fontWeight: 'var(--font-weight-bold)',
            color: 'var(--color-primary)'
          }
        }, `$${(investmentAmount * totalApy / 365 / 100).toFixed(2)}`)
      ),
      
      React.createElement('div', { 
        className: 'metric-card-simple',
        style: {
          background: 'var(--color-background)',
          borderRadius: '16px',
          padding: '20px',
          boxShadow: 'var(--neuro-shadow-subtle)',
          textAlign: 'center',
          transition: 'all 0.3s ease'
        }
      },
        React.createElement('div', {
          style: {
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-secondary)',
            marginBottom: '8px',
            fontWeight: 'var(--font-weight-medium)'
          }
        }, `Monthly ($${investmentAmount.toLocaleString()})`),
        React.createElement('div', {
          style: {
            fontSize: 'var(--font-size-xl)',
            fontWeight: 'var(--font-weight-bold)',
            color: 'var(--color-text)'
          }
        }, `$${(investmentAmount * totalApy / 12 / 100).toFixed(2)}`)
      ),
      
      React.createElement('div', { 
        className: 'metric-card-simple risk-card',
        style: {
          background: 'var(--color-background)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: 'var(--neuro-shadow-raised)',
          textAlign: 'center',
          transition: 'all 0.3s ease',
          border: `2px solid ${riskAssessment.color.replace('var(--color-', '').replace(')', '') === 'error' ? 'rgba(239, 68, 68, 0.2)' : 
                                   riskAssessment.color.replace('var(--color-', '').replace(')', '') === 'warning' ? 'rgba(245, 158, 11, 0.2)' : 
                                   'rgba(34, 197, 94, 0.2)'}`
        }
      },
        React.createElement('div', {
          style: {
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-secondary)',
            marginBottom: '8px',
            fontWeight: 'var(--font-weight-medium)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }
        }, 'Risk Assessment'),
        React.createElement('div', {
          style: {
            fontSize: 'var(--font-size-xl)',
            fontWeight: '900',
            color: riskAssessment.color,
            marginBottom: '6px'
          }
        }, riskAssessment.level),
        React.createElement('div', {
          style: {
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)',
            lineHeight: '1.3',
            marginBottom: '8px'
          }
        }, riskAssessment.description),
        riskAssessment.factors.length > 0 && React.createElement('div', {
          style: {
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)',
            opacity: 0.8
          }
        }, `Key factors: ${riskAssessment.factors.slice(0, 2).join(', ')}`)
      )
    ),
    
    // Collapsible Yield Calculator
    React.createElement('div', { 
      className: `calculator-compact ${calculatorExpanded ? 'expanded' : ''}`,
      style: {
        background: 'var(--color-background)',
        borderRadius: '16px',
        padding: calculatorExpanded ? '24px' : '20px',
        boxShadow: calculatorExpanded ? 'var(--neuro-shadow-raised)' : 'var(--neuro-shadow-pressed)',
        marginBottom: '32px',
        transition: 'all 0.3s ease'
      }
    },
      // Calculator Header
      React.createElement('div', {
        className: 'calculator-header',
        onClick: () => setCalculatorExpanded(!calculatorExpanded),
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          marginBottom: calculatorExpanded ? '24px' : '0'
        }
      },
        React.createElement('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }
        },
          React.createElement('span', {
            style: {
              fontSize: 'var(--font-size-2xl)'
            }
          }, '💰'),
          React.createElement('div', null,
            React.createElement('div', {
              style: {
                fontSize: 'var(--font-size-lg)',
                fontWeight: 'var(--font-weight-bold)',
                color: 'var(--color-text)'
              }
            }, 'Calculate Your Earnings'),
            React.createElement('div', {
              style: {
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                marginTop: '2px'
              }
            }, `Quick estimate for $${investmentAmount}: $${(investmentAmount * totalApy / 365 / 100).toFixed(2)}/day`)
          )
        ),
        React.createElement('div', {
          className: 'calculator-toggle',
          style: {
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'var(--color-background)',
            boxShadow: 'var(--neuro-shadow-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.3s ease',
            transform: calculatorExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
          }
        }, '▼')
      ),
      
      // Expanded Calculator Content
      calculatorExpanded && React.createElement('div', {
        className: 'calculator-content',
        style: {
          animation: 'fadeIn 0.3s ease'
        }
      },
        // Investment Input
        React.createElement('div', { 
          className: 'investment-input-group',
          style: {
            marginBottom: '24px',
            textAlign: 'center'
          }
        },
          React.createElement('div', { 
            className: 'input-wrapper',
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginBottom: '16px'
            }
          },
            React.createElement('span', {
              style: {
                fontSize: 'var(--font-size-lg)',
                fontWeight: 'var(--font-weight-bold)',
                color: 'var(--color-text-secondary)'
              }
            }, '$'),
            React.createElement('input', {
              type: 'number',
              className: 'amount-input',
              value: investmentAmount,
              onChange: (e) => setInvestmentAmount(Number(e.target.value) || 0),
              min: '0',
              step: '100',
              style: {
                width: '180px',
                padding: '12px 16px',
                border: 'none',
                borderRadius: '12px',
                background: 'var(--color-background)',
                color: 'var(--color-text)',
                fontSize: 'var(--font-size-lg)',
                fontWeight: 'var(--font-weight-medium)',
                textAlign: 'center',
                boxShadow: 'var(--neuro-shadow-pressed)',
                outline: 'none'
              }
            })
          ),
          
          // Quick Amount Buttons
          React.createElement('div', { 
            style: {
              display: 'flex',
              gap: '8px',
              justifyContent: 'center',
              flexWrap: 'wrap'
            }
          },
            [100, 1000, 5000, 10000].map(amount => 
              React.createElement('button', {
                key: amount,
                onClick: () => setInvestmentAmount(amount),
                style: {
                  padding: '6px 12px',
                  border: 'none',
                  background: investmentAmount === amount ? 'var(--color-primary)' : 'var(--color-background)',
                  backgroundColor: investmentAmount === amount ? 'var(--color-primary)' : 'var(--color-background)', // Explicit override
                  color: investmentAmount === amount ? 'white' : 'var(--color-text-secondary)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 'var(--font-weight-medium)',
                  boxShadow: investmentAmount === amount ? 'var(--neuro-shadow-pressed)' : 'var(--neuro-shadow-subtle)',
                  transition: 'all 0.2s ease',
                  opacity: 1 // Ensure no transparency
                }
              }, `$${amount >= 1000 ? `${amount/1000}k` : amount}`)
            )
          )
        ),
        
        // Tab Navigation for Time Periods
        React.createElement('div', { 
          style: {
            display: 'flex',
            gap: '4px',
            marginBottom: '16px',
            background: 'var(--color-background)',
            borderRadius: '12px',
            padding: '4px',
            boxShadow: 'var(--neuro-shadow-pressed)'
          }
        },
          ['24hours', '30days', '1year', 'compounding'].map(tab => {
            const tabLabels = {
              '24hours': '24 Hours',
              '30days': '30 Days', 
              '1year': '1 Year',
              'compounding': 'Compounding'
            };
            
            return React.createElement('button', {
              key: tab,
              onClick: () => setActiveCalculatorTab(tab),
              style: {
                flex: 1,
                padding: '8px 12px',
                border: 'none',
                borderRadius: '8px',
                background: activeCalculatorTab === tab ? 'var(--color-primary)' : 'var(--color-background)',
                backgroundColor: activeCalculatorTab === tab ? 'var(--color-primary)' : 'var(--color-background)', // Explicit override
                color: activeCalculatorTab === tab ? 'white' : 'var(--color-text-secondary)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-medium)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: activeCalculatorTab === tab ? 'var(--neuro-shadow-pressed)' : 'var(--neuro-shadow-raised)',
                opacity: 1 // Ensure no transparency
              }
            }, tabLabels[tab]);
          })
        ),
        
        // Primary Yield Result (based on selected tab)
        React.createElement('div', { 
          style: {
            background: 'var(--color-background)',
            borderRadius: '16px',
            padding: '24px',
            textAlign: 'center',
            boxShadow: 'var(--neuro-shadow-raised)',
            marginBottom: '16px'
          }
        },
          React.createElement('div', {
            style: {
              fontSize: 'var(--font-size-base)',
              color: 'var(--color-text-secondary)',
              marginBottom: '8px',
              fontWeight: 'var(--font-weight-medium)'
            }
          }, activeCalculatorTab === '24hours' ? 'Estimated Daily Earnings' :
             activeCalculatorTab === '30days' ? 'Estimated Monthly Earnings' :
             activeCalculatorTab === '1year' ? 'Estimated Annual Earnings' :
             'Estimated Annual Earnings (Compounded)'),
          React.createElement('div', {
            style: {
              fontSize: 'var(--font-size-3xl)',
              fontWeight: '900',
              background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-forest) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              lineHeight: '1.1',
              marginBottom: '8px'
            }
          }, activeCalculatorTab === '24hours' ? `$${yields.oneDayGain.toFixed(2)}` :
             activeCalculatorTab === '30days' ? `$${(investmentAmount * totalApy / 12 / 100).toFixed(2)}` :
             activeCalculatorTab === '1year' ? `$${(investmentAmount * totalApy / 100).toFixed(2)}` :
             `$${(investmentAmount * Math.pow(1 + totalApy/100/365, 365) - investmentAmount).toFixed(2)}`),
          React.createElement('div', {
            style: {
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
              fontWeight: 'var(--font-weight-medium)'
            }
          }, `Based on $${investmentAmount.toLocaleString()} investment`)
        ),
        
        React.createElement('div', { 
          style: {
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)',
            textAlign: 'center',
            fontStyle: 'italic',
            padding: '12px',
            background: 'rgba(16, 185, 129, 0.05)',
            borderRadius: '8px',
            borderLeft: '3px solid var(--color-primary)'
          }
        }, 'Calculations are estimates. Actual yields may vary based on market conditions.')
      )
    ),
    
    // Collapsible Pool Information
    React.createElement('div', { 
      className: `pool-info-section ${poolInfoExpanded ? 'expanded' : ''}`,
      style: {
        background: 'var(--color-background)',
        borderRadius: '16px',
        padding: poolInfoExpanded ? '24px' : '20px',
        boxShadow: poolInfoExpanded ? 'var(--neuro-shadow-raised)' : 'var(--neuro-shadow-pressed)',
        marginBottom: '32px',
        transition: 'all 0.3s ease'
      }
    },
      // Pool Info Header
      React.createElement('div', {
        className: 'pool-info-header',
        onClick: () => setPoolInfoExpanded(!poolInfoExpanded),
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          marginBottom: poolInfoExpanded ? '20px' : '0'
        }
      },
        React.createElement('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }
        },
          React.createElement('span', {
            style: {
              fontSize: 'var(--font-size-lg)'
            }
          }, '📊'),
          React.createElement('h3', {
            style: {
              fontSize: 'var(--font-size-lg)',
              fontWeight: 'var(--font-weight-bold)',
              color: 'var(--color-text)',
              margin: 0
            }
          }, 'Pool Information'),
          protocolUrl && React.createElement('a', {
            href: protocolUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
            onClick: (e) => e.stopPropagation(),
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              background: 'var(--color-background)',
              color: 'var(--color-primary)',
              textDecoration: 'none',
              borderRadius: '6px',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 'var(--font-weight-medium)',
              boxShadow: 'var(--neuro-shadow-subtle)',
              transition: 'all 0.2s ease'
            }
          }, 'Protocol', '↗')
        ),
        React.createElement('div', {
          className: 'pool-info-toggle',
          style: {
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: 'var(--color-background)',
            boxShadow: 'var(--neuro-shadow-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.3s ease',
            transform: poolInfoExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
          }
        }, '▼')
      ),
      
      // Expanded Pool Information Content
      poolInfoExpanded && React.createElement('div', {
        className: 'pool-info-content',
        style: {
          animation: 'fadeIn 0.3s ease'
        }
      },
        // APY Breakdown Grid
        React.createElement('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
          marginBottom: '20px'
        }
      },
        // APY Breakdown
        (pool.apyBase > 0 && pool.apyReward > 0) && React.createElement('div', {
          style: {
            padding: '12px',
            background: 'var(--color-background)',
            borderRadius: '8px',
            boxShadow: 'var(--neuro-shadow-subtle)',
            textAlign: 'center'
          }
        },
          React.createElement('div', {
            style: {
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-secondary)',
              marginBottom: '4px',
              textTransform: 'uppercase'
            }
          }, 'Base APY'),
          React.createElement('div', {
            style: {
              fontSize: 'var(--font-size-base)',
              fontWeight: 'var(--font-weight-bold)',
              color: 'var(--color-text)'
            }
          }, `${pool.apyBase.toFixed(1)}%`)
        ),
        
        (pool.apyBase > 0 && pool.apyReward > 0) && React.createElement('div', {
          style: {
            padding: '12px',
            background: 'var(--color-background)',
            borderRadius: '8px',
            boxShadow: 'var(--neuro-shadow-subtle)',
            textAlign: 'center'
          }
        },
          React.createElement('div', {
            style: {
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-secondary)',
              marginBottom: '4px',
              textTransform: 'uppercase'
            }
          }, 'Reward APY'),
          React.createElement('div', {
            style: {
              fontSize: 'var(--font-size-base)',
              fontWeight: 'var(--font-weight-bold)',
              color: 'var(--color-primary)'
            }
          }, `${pool.apyReward.toFixed(1)}%`)
        ),
        
        // Pool Age (if available)
        React.createElement('div', {
          style: {
            padding: '12px',
            background: 'var(--color-background)',
            borderRadius: '8px',
            boxShadow: 'var(--neuro-shadow-subtle)',
            textAlign: 'center'
          }
        },
          React.createElement('div', {
            style: {
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-secondary)',
              marginBottom: '4px',
              textTransform: 'uppercase'
            }
          }, 'Pool Type'),
          React.createElement('div', {
            style: {
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-medium)',
              color: 'var(--color-text)'
            }
          }, poolType)
        )
      ),
      
      // Tokens Section (if available)
      (pool.underlyingTokens && pool.underlyingTokens.length > 0) && 
        React.createElement('div', {
          style: {
            marginTop: '16px',
            paddingTop: '16px',
            borderTop: '1px solid rgba(16, 185, 129, 0.1)'
          }
        },
          React.createElement('div', {
            style: {
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
              marginBottom: '8px',
              fontWeight: 'var(--font-weight-medium)'
            }
          }, 'Underlying Assets'),
          React.createElement('div', {
            style: {
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px'
            }
          },
            pool.underlyingTokens.map((token, idx) => {
              const isAddress = typeof token === 'string' && token.startsWith('0x') && token.length >= 40;
              
              if (isAddress) {
                return React.createElement('a', {
                  key: idx,
                  href: `https://blockscan.com/address/${token}`,
                  target: '_blank',
                  rel: 'noopener noreferrer',
                  style: {
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '6px 10px',
                    background: 'var(--color-background)',
                    color: 'var(--color-primary)',
                    borderRadius: '8px',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 'var(--font-weight-medium)',
                    boxShadow: 'var(--neuro-shadow-subtle)',
                    textDecoration: 'none',
                    transition: 'all 0.2s ease',
                    fontFamily: 'monospace'
                  }
                }, `${token.slice(0, 6)}...${token.slice(-4)} ↗`);
              }
              
              return React.createElement('span', {
                key: idx,
                style: {
                  padding: '6px 10px',
                  background: 'var(--color-background)',
                  color: 'var(--color-text)',
                  borderRadius: '8px',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 'var(--font-weight-medium)',
                  boxShadow: 'var(--neuro-shadow-subtle)'
                }
              }, token);
            })
          )
        )
      )
    ),
    
    // Compact Risk & Legal Section
    React.createElement('div', { 
      className: 'risk-disclaimer-compact',
      style: {
        background: 'var(--color-background)',
        border: '1px solid rgba(255, 193, 7, 0.2)',
        borderRadius: '12px',
        padding: '16px',
        boxShadow: 'var(--neuro-shadow-pressed)'
      }
    },
      React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px'
        }
      },
        React.createElement('span', {
          style: {
            fontSize: 'var(--font-size-lg)',
            marginTop: '2px'
          }
        }, '⚠️'),
        React.createElement('div', null,
          React.createElement('div', {
            style: {
              fontSize: 'var(--font-size-base)',
              fontWeight: 'var(--font-weight-bold)',
              color: '#ff6b35',
              marginBottom: '6px'
            }
          }, 'Important Risk Information'),
          React.createElement('p', {
            style: {
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
              lineHeight: '1.4',
              margin: '0'
            }
          }, 'DeFi investments carry risks including smart contract vulnerabilities and market volatility. Only invest what you can afford to lose.')
        )
      )
    ) // End of risk disclaimer
  );
}

// Simple fade-in animation for calculator
const fadeInStyles = `
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

// Inject animation styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = fadeInStyles;
  document.head.appendChild(styleSheet);
}

// Export for use in main app
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PoolDetail;
}