import styled from 'styled-components'
import { FaWhatsapp, FaTelegram } from 'react-icons/fa'
import { FiPlus } from 'react-icons/fi'
import CpuComponent from './CpuComponent'
import '../styles/platforms.css'
import '../styles/techBackground.css'

const IllustrationContainer = styled.div`
  position: relative;
  width: 100%;
  min-height: 600px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  margin: 0 auto;
  padding: 40px 10px;
  overflow: hidden;
`

const Title = styled.h2`
  font-size: 1.75rem;
  font-weight: 600;
  color: #ffffff;
  margin-bottom: 2rem;
  text-align: center;
  position: relative;
  display: inline-block;
  padding-bottom: 0.5rem;
  z-index: 10;

  &:after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 60%;
    height: 3px;
    background: linear-gradient(90deg, #25D366, #0088cc, #6c5ce7);
    border-radius: 3px;
  }
`

const CardsContainer = styled.div`
  display: flex;
  flex-direction: row;
  gap: 100px;
  align-items: center;
  justify-content: center;
  width: 100%;
  position: relative;
  margin-top: 50px;

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 16px;
    margin-top: 24px;
  }
`

const CardContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background-color: rgba(17, 17, 17, 0.7);
  backdrop-filter: blur(5px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  width: 100%;
  max-width: 180px;
  min-height: 180px;
  text-decoration: none;
  transition: all 0.3s ease;
  position: relative;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 10;

  &:before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: radial-gradient(circle at center, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0) 70%);
    opacity: 0;
    transition: opacity 0.3s ease;
    border-radius: 16px;
  }

  &:after {
    content: '';
    position: absolute;
    top: -2px;
    left: -2px;
    right: -2px;
    bottom: -2px;
    border-radius: 16px;
    background: ${props => props.borderGlow || 'transparent'};
    opacity: 0.4;
    z-index: -1;
    animation: glowPulse 3s infinite ease-in-out;
    box-shadow: 0 0 20px ${props => props.glowColor || 'transparent'};
  }

  @keyframes glowPulse {
    0% { opacity: 0.3; filter: blur(3px); }
    50% { opacity: 0.7; filter: blur(5px); }
    100% { opacity: 0.3; filter: blur(3px); }
  }

  &:hover {
    background-color: rgba(17, 17, 17, 0.8);
    transform: translateY(-4px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);

    &:before {
      opacity: 1;
    }

    &:after {
      opacity: 0.9;
      animation: glowPulse 2s infinite;
      filter: blur(3px);
    }
  }

  @media (max-width: 768px) {
    max-width: 100%;
  }
`

const IconContainer = styled.div`
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: ${props => props.background || 'transparent'};
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  position: relative;
  z-index: 1;
  transition: all 0.3s ease;

  &:after {
    content: '';
    position: absolute;
    top: -2px;
    left: -2px;
    right: -2px;
    bottom: -2px;
    border-radius: 50%;
    background: ${props => props.background || 'transparent'};
    opacity: 0.4;
    z-index: -1;
    transform: scale(0.8);
    filter: blur(8px);
    transition: all 0.3s ease;
  }

  ${CardContainer}:hover & {
    transform: scale(1.1);

    &:after {
      transform: scale(1.2);
      opacity: 0.6;
    }
  }
`

const PlatformName = styled.span`
  font-size: 16px;
  font-weight: 600;
  margin-top: 12px;
  color: #ffffff;
  text-align: center;
  position: relative;
  z-index: 1;
  transition: all 0.3s ease;

  ${CardContainer}:hover & {
    transform: scale(1.05);
  }

  &:after {
    content: '';
    position: absolute;
    bottom: -4px;
    left: 50%;
    width: 0;
    height: 2px;
    background: ${props => props.color || '#ffffff'};
    transition: all 0.3s ease;
    transform: translateX(-50%);
    opacity: 0;
  }

  ${CardContainer}:hover &:after {
    width: 70%;
    opacity: 0.7;
  }
`

const PlatformCard = ({ icon, name, background }) => {
  // Determine text color based on background
  const getColor = () => {
    if (background.includes('#25D366')) return '#25D366';
    if (background.includes('#0088cc')) return '#0088cc';
    if (background.includes('#6c5ce7')) return '#6c5ce7';
    return '#ffffff';
  };

  // Determine border glow color based on background
  const getBorderGlow = () => {
    if (background.includes('#25D366')) return 'linear-gradient(135deg, rgba(37, 211, 102, 0.5), rgba(18, 140, 126, 0.5))';
    if (background.includes('#0088cc')) return 'linear-gradient(135deg, rgba(0, 136, 204, 0.5), rgba(0, 86, 163, 0.5))';
    if (background.includes('#6c5ce7')) return 'linear-gradient(135deg, rgba(108, 92, 231, 0.5), rgba(72, 52, 212, 0.5))';
    return 'transparent';
  };

  // Get glow color for box-shadow
  const getGlowColor = () => {
    if (background.includes('#25D366')) return 'rgba(37, 211, 102, 0.7)';
    if (background.includes('#0088cc')) return 'rgba(0, 136, 204, 0.7)';
    if (background.includes('#6c5ce7')) return 'rgba(108, 92, 231, 0.7)';
    return 'transparent';
  };

  return (
    <CardContainer borderGlow={getBorderGlow()} glowColor={getGlowColor()}>
      <IconContainer background={background}>
        {icon}
      </IconContainer>
      <PlatformName color={getColor()}>{name}</PlatformName>
    </CardContainer>
  )
}

const TechBackground = () => {
  return (
    <div className="tech-background">
      <div className="grid-pattern"></div>
      <div className="glow-effect top-left"></div>
      <div className="glow-effect bottom-right"></div>
    </div>
  )
}


const PlatformShowcase = () => {
  return (
    <IllustrationContainer>
      <TechBackground />

      <div className="w-full flex justify-center mb-4 mt-8">
        <CpuComponent />
      </div>

      <div className="flex justify-center w-full mt-12">
        <Title>Supported Platforms</Title>
      </div>

      <CardsContainer>
        <PlatformCard
          icon={<FaWhatsapp className="text-4xl" />}
          name="WhatsApp"
          background="linear-gradient(135deg, #25D366, #128C7E)"
        />
        <PlatformCard
          icon={<FaTelegram className="text-4xl" />}
          name="Telegram"
          background="linear-gradient(135deg, #0088cc, #0056a3)"
        />
        <PlatformCard
          icon={<FiPlus className="text-4xl" />}
          name="More to Come"
          background="linear-gradient(135deg, #6c5ce7, #4834d4)"
        />
      </CardsContainer>
    </IllustrationContainer>
  )
}

export default PlatformShowcase
