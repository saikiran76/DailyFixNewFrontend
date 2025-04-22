import styled, { keyframes } from 'styled-components'

const fadeInOut = keyframes`
  0% { opacity: 0.2; }
  50% { opacity: 0.8; }
  100% { opacity: 0.2; }
`

const CpuContainer = styled.div`
  position: relative;
  width: 150px;
  height: 90px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-bottom: 32px;
  background-color: rgba(0, 0, 0, 0.8);
  border: 1px solid rgba(0, 170, 255, 0.3);
  border-radius: 4px;
  z-index: 10;
  box-shadow: 0 0 15px rgba(0, 170, 255, 0.2);
`

const CpuShine = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 4px;
  background: radial-gradient(circle at 50% 0%, rgba(0, 170, 255, 0.1) 0%, transparent 60%);
  z-index: -1;
`

const CpuGlow = styled.div`
  position: absolute;
  top: -5px;
  left: -5px;
  right: -5px;
  bottom: -5px;
  border-radius: 6px;
  background: transparent;
  border: 1px solid rgba(0, 170, 255, 0.3);
  filter: blur(5px);
  animation: ${fadeInOut} 4s infinite;
  z-index: -1;
`

const ConnectorsContainer = styled.div`
  position: absolute;
  display: flex;
  justify-content: space-between;
  ${props => props.side === 'left' || props.side === 'right' ? `
    flex-direction: column;
    width: 8px;
    height: 100%;
    top: 0;
    ${props.side === 'left' ? 'left: -8px;' : 'right: -8px;'}
  ` : `
    flex-direction: row;
    width: 100%;
    height: 8px;
    left: 0;
    ${props.side === 'top' ? 'top: -8px;' : 'bottom: -8px;'}
  `}
`

const Connector = styled.span`
  background-color: rgba(255, 255, 255, 0.15);
  ${props => props.side === 'left' || props.side === 'right' ? `
    width: 8px;
    height: 2px;
  ` : `
    width: 2px;
    height: 8px;
  `}
  margin: 0;
  animation: ${fadeInOut} 3s infinite;
  animation-delay: ${props => props.index * 0.2}s;
`

const CpuText = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: rgba(0, 170, 255, 0.9);
  text-transform: uppercase;
  letter-spacing: 0.5px;
`

const CpuComponent = () => {
  const topConnectors = [0, 1, 2, 3, 4, 5]
  const bottomConnectors = [0, 1, 2, 3, 4, 5]
  const sideConnectors = [0, 1]

  return (
    <CpuContainer>
      <CpuShine />
      <CpuGlow />

      <ConnectorsContainer side="left">
        {sideConnectors.map(index => (
          <Connector key={`left-${index}`} side="left" index={index} />
        ))}
      </ConnectorsContainer>

      <ConnectorsContainer side="top">
        {topConnectors.map(index => (
          <Connector key={`top-${index}`} side="top" index={index} />
        ))}
      </ConnectorsContainer>

      <CpuText>Powered By DailyFix</CpuText>

      <ConnectorsContainer side="bottom">
        {bottomConnectors.map(index => (
          <Connector key={`bottom-${index}`} side="bottom" index={index} />
        ))}
      </ConnectorsContainer>

      <ConnectorsContainer side="right">
        {sideConnectors.map(index => (
          <Connector key={`right-${index}`} side="right" index={index} />
        ))}
      </ConnectorsContainer>
    </CpuContainer>
  )
}

export default CpuComponent