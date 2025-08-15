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
  
  // Determine pool type
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
    // Header with Back Button and Logo
    React.createElement('div', { 
      className: 'header animate-on-mount',
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 0 32px 0',
        marginBottom: '32px',
        borderBottom: '1px solid rgba(16, 185, 129, 0.1)'
      }
    },
      React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }
      },
        // Back Button
        React.createElement('button', { 
          className: 'back-to-results-btn',
          onClick: onBack,
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            background: 'var(--color-background)',
            border: 'none',
            borderRadius: '12px',
            color: 'var(--color-text)',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-medium)',
            cursor: 'pointer',
            boxShadow: 'var(--neuro-shadow-subtle)',
            transition: 'all 0.2s ease'
          }
        }, 
          React.createElement('span', { className: 'back-arrow' }, '←'),
          React.createElement('span', null, 'Back to results')
        ),
        
        // DeFi Garden Logo
        React.createElement('h1', { 
          className: 'logo',
          style: {
            fontSize: 'var(--font-size-2xl)',
            fontWeight: 'var(--font-weight-black)',
            color: 'var(--color-text)',
            margin: 0,
            cursor: 'pointer'
          },
          onClick: onBack
        }, 'DeFi Garden')
      ),
      
      // Pool Badge
      React.createElement('div', {
        className: 'pool-breadcrumb',
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 16px',
          background: 'var(--color-background)',
          borderRadius: '20px',
          boxShadow: 'var(--neuro-shadow-pressed)',
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text-secondary)'
        }
      },
        React.createElement('span', null, 'Pool Details'),
        React.createElement('span', { style: { color: 'var(--color-primary)' } }, '•'),
        React.createElement('span', { 
          style: { 
            color: 'var(--color-text)',
            fontWeight: 'var(--font-weight-semibold)'
          } 
        }, pool.symbol)
      )
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
              minWidth: '180px'
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
                lineHeight: '1.1'
              }
            }, formatAPY(pool.apyBase, pool.apyReward))
          ),
          
          protocolUrlWithRef && React.createElement('button', {
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
            React.createElement('span', null, 'Start Earning'),
            React.createElement('span', {
              className: 'arrow',
              style: {
                transition: 'transform 0.2s ease'
              }
            }, '→')
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
        }, 'Daily ($1000)'),
        React.createElement('div', {
          style: {
            fontSize: 'var(--font-size-xl)',
            fontWeight: 'var(--font-weight-bold)',
            color: 'var(--color-primary)'
          }
        }, `$${(1000 * totalApy / 365 / 100).toFixed(2)}`)
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
        }, 'Monthly ($1000)'),
        React.createElement('div', {
          style: {
            fontSize: 'var(--font-size-xl)',
            fontWeight: 'var(--font-weight-bold)',
            color: 'var(--color-text)'
          }
        }, `$${(1000 * totalApy / 12 / 100).toFixed(2)}`)
      ),
      
      React.createElement('div', { 
        className: 'metric-card-simple risk-card',
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
        }, 'Risk Level'),
        React.createElement('div', {
          style: {
            fontSize: 'var(--font-size-lg)',
            fontWeight: 'var(--font-weight-bold)',
            color: pool.tvlUsd > 10000000 ? 'var(--color-success)' : pool.tvlUsd > 1000000 ? 'var(--color-warning)' : 'var(--color-error)'
          }
        }, pool.tvlUsd > 10000000 ? 'Low' : pool.tvlUsd > 1000000 ? 'Medium' : 'High')
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
                  color: investmentAmount === amount ? 'white' : 'var(--color-text-secondary)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 'var(--font-weight-medium)',
                  boxShadow: investmentAmount === amount ? 'var(--neuro-shadow-pressed)' : 'var(--neuro-shadow-subtle)',
                  transition: 'all 0.2s ease'
                }
              }, `$${amount >= 1000 ? `${amount/1000}k` : amount}`)
            )
          )
        ),
        
        // Compact Yield Results
        React.createElement('div', { 
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '12px',
            marginBottom: '16px'
          }
        },
          React.createElement('div', { 
            style: {
              background: 'var(--color-background)',
              borderRadius: '12px',
              padding: '16px',
              textAlign: 'center',
              boxShadow: 'var(--neuro-shadow-subtle)'
            }
          },
            React.createElement('div', {
              style: {
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                marginBottom: '4px'
              }
            }, '24 Hours'),
            React.createElement('div', {
              style: {
                fontSize: 'var(--font-size-lg)',
                fontWeight: 'var(--font-weight-bold)',
                color: 'var(--color-primary)'
              }
            }, `$${yields.oneDayGain.toFixed(2)}`)
          ),
          
          React.createElement('div', { 
            style: {
              background: 'var(--color-background)',
              borderRadius: '12px',
              padding: '16px',
              textAlign: 'center',
              boxShadow: 'var(--neuro-shadow-subtle)'
            }
          },
            React.createElement('div', {
              style: {
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                marginBottom: '4px'
              }
            }, '30 Days'),
            React.createElement('div', {
              style: {
                fontSize: 'var(--font-size-lg)',
                fontWeight: 'var(--font-weight-bold)',
                color: 'var(--color-text)'
              }
            }, `$${(investmentAmount * totalApy / 12 / 100).toFixed(2)}`)
          ),
          
          React.createElement('div', { 
            style: {
              background: 'var(--color-background)',
              borderRadius: '12px',
              padding: '16px',
              textAlign: 'center',
              boxShadow: 'var(--neuro-shadow-subtle)'
            }
          },
            React.createElement('div', {
              style: {
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                marginBottom: '4px'
              }
            }, '1 Year'),
            React.createElement('div', {
              style: {
                fontSize: 'var(--font-size-lg)',
                fontWeight: 'var(--font-weight-bold)',
                color: 'var(--color-success)'
              }
            }, `$${(investmentAmount * totalApy / 100).toFixed(2)}`)
          ),
          
          React.createElement('div', { 
            style: {
              background: 'var(--color-background)',
              borderRadius: '12px',
              padding: '16px',
              textAlign: 'center',
              boxShadow: 'var(--neuro-shadow-subtle)'
            }
          },
            React.createElement('div', {
              style: {
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                marginBottom: '4px'
              }
            }, 'Compounding'),
            React.createElement('div', {
              style: {
                fontSize: 'var(--font-size-lg)',
                fontWeight: 'var(--font-weight-bold)',
                color: 'var(--color-success)'
              }
            }, `$${(investmentAmount * Math.pow(1 + totalApy/100/365, 365) - investmentAmount).toFixed(2)}`)
          )
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