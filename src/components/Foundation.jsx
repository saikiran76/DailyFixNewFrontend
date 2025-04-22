import { useRef, useEffect } from 'react'
import styled from 'styled-components'
import TechnologyCard from './TechnologyCard'
import CpuComponent from './cpuComponent'

const IllustrationContainer = styled.div`
  position: relative;
  width: 100%;
  max-width: 891px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
`

const SVGContainer = styled.div`
  position: relative;
  width: 100%;
  height: 264px;
  margin-bottom: 32px;
`

const StyledSVG = styled.svg`
  width: 100%;
  height: 100%;
`

const CardsContainer = styled.div`
  display: flex;
  flex-direction: row;
  gap: 32px;
  align-items: center;
  justify-content: center;
  margin-top: 16px;
  width: 100%;
  
  @media (max-width: 768px) {
    flex-direction: column;
    gap: 16px;
  }
`

const FoundationIllustration = () => {
  const bluePulse1Ref = useRef(null)
  const bluePulse2Ref = useRef(null)
  const pinkPulse1Ref = useRef(null)
  const pinkPulse2Ref = useRef(null)
  const orangePulse1Ref = useRef(null)
  const orangePulse2Ref = useRef(null)

  useEffect(() => {
    const animateGradient = (element, startX, startY, endX, endY, duration, delay = 0) => {
      if (!element) return
      
      const keyframes = [
        { offset: 0, stopColor: element.id.includes('blue') ? '#2EB9DF' : element.id.includes('pink') ? '#FF4A81' : '#FF7432', stopOpacity: '0' },
        { offset: 0.05, stopColor: element.id.includes('blue') ? '#2EB9DF' : element.id.includes('pink') ? '#FF4A81' : '#FF7432', stopOpacity: '1' },
        { offset: 1, stopColor: element.id.includes('blue') ? '#2EB9DF' : element.id.includes('pink') ? element.id.includes('pink-pulse-1') ? '#0196FF' : '#DF6CF6' : '#F7CC4B', stopOpacity: '0' }
      ]
      
      // Animate x1, y1, x2, y2 attributes
      let startTime = null
      const animate = (timestamp) => {
        if (!startTime) startTime = timestamp + (delay * 1000)
        const elapsed = timestamp - startTime
        
        if (elapsed < 0) {
          requestAnimationFrame(animate)
          return
        }
        
        const progress = Math.min(elapsed / (duration * 1000), 1)
        
        // Update gradient positions
        element.setAttribute('x1', startX + (endX - startX) * progress)
        element.setAttribute('y1', startY + (endY - startY) * progress)
        element.setAttribute('x2', startX + (endX - startX) * progress + 50)
        element.setAttribute('y2', startY + (endY - startY) * progress + 50)
        
        if (progress < 1) {
          requestAnimationFrame(animate)
        } else {
          // Reset and repeat
          startTime = null
          requestAnimationFrame(animate)
        }
      }
      
      requestAnimationFrame(animate)
    }
    
    // Animate all gradients with different paths
    animateGradient(bluePulse1Ref.current, 400, 83, 350, 133.75, 3)
    animateGradient(bluePulse2Ref.current, 317, 131, 280, 177, 4, 1)
    animateGradient(pinkPulse1Ref.current, 412, 263, 412, 303, 4, 0.5)
    animateGradient(pinkPulse2Ref.current, 488, 206, 482, 229, 3, 1.5)
    animateGradient(orangePulse1Ref.current, 482, 166, 511, 214, 3.5, 1)
    animateGradient(orangePulse2Ref.current, 491, 187, 557, 267, 4, 2)
  }, [])

  return (
    <IllustrationContainer>
      <SVGContainer>
        <StyledSVG 
          fill="none" 
          viewBox="0 0 891 264" 
          role="img" 
          aria-label="A bunch of connecting lines that form into the CPU, with the text Powered By on top of the the CPU. Gradient lines are animating along the drawn lines, dissolving into the CPU in the center."
        >
          {/* Static paths */}
          <path d="M388 96L388 68C388 65.7909 386.209 64 384 64L310 64" stroke="var(--geist-foreground)" strokeOpacity="0.1" pathLength="1" strokeDashoffset="0px" strokeDasharray="1px 1px" />
          <path d="M349 150L73 150C70.7909 150 69 151.791 69 154L69 174" stroke="var(--geist-foreground)" strokeOpacity="0.1" pathLength="1" strokeDashoffset="0px" strokeDasharray="1px 1px" />
          
          {/* Orange pulse 1 */}
          <g>
            <path d="M547 130L822 130C824.209 130 826 131.791 826 134L826 264" stroke="var(--geist-foreground)" strokeOpacity="0.1" pathLength="1" strokeDashoffset="0px" strokeDasharray="1px 1px" />
            <path d="M547 130L822 130C824.209 130 826 131.791 826 134L826 264" stroke="url(#orange-pulse-1)" strokeWidth="2" />
          </g>
          
          {/* Blue pulse 1 */}
          <g>
            <path d="M349 130L5.00002 130C2.79088 130 1.00001 131.791 1.00001 134L1.00001 264" stroke="var(--geist-foreground)" strokeOpacity="0.1" pathLength="1" strokeDashoffset="0px" strokeDasharray="1px 1px" />
            <path d="M349 130L5.00002 130C2.79088 130 1.00001 131.791 1.00001 134L1.00001 264" stroke="url(#blue-pulse-1)" strokeLinecap="round" strokeWidth="2" />
          </g>
          
          {/* Pink pulse 2 */}
          <g>
            <path d="M547 150L633 150C635.209 150 637 151.791 637 154L637 236C637 238.209 635.209 240 633 240L488 240C485.791 240 484 241.791 484 244L484 264" stroke="var(--geist-foreground)" strokeOpacity="0.1" pathLength="1" strokeDashoffset="0px" strokeDasharray="1px 1px" />
            <path d="M547 150L633 150C635.209 150 637 151.791 637 154L637 236C637 238.209 635.209 240 633 240L488 240C485.791 240 484 241.791 484 244L484 264" stroke="url(#pink-pulse-2)" strokeLinecap="round" strokeWidth="2" />
          </g>
          
          {/* Blue pulse 2 */}
          <g>
            <path d="M388 184L388 194C388 196.209 386.209 198 384 198L77 198C74.7909 198 73 199.791 73 202L73 264" stroke="var(--geist-foreground)" strokeOpacity="0.1" pathLength="1" strokeDashoffset="0px" strokeDasharray="1px 1px" />
            <path d="M388 184L388 194C388 196.209 386.209 198 384 198L77 198C74.7909 198 73 199.791 73 202L73 264" stroke="url(#blue-pulse-2)" strokeLinecap="round" strokeWidth="2" />
          </g>
          
          <path d="M412 96L412 0" stroke="url(#paint0_linear_341_27683)" strokeOpacity="0.1" pathLength="1" strokeDashoffset="0px" strokeDasharray="1px 1px" />
          
          {/* Pink pulse 1 */}
          <g>
            <path d="M412 263.5L412 184" stroke="var(--geist-foreground)" strokeOpacity="0.1" pathLength="1" strokeDashoffset="0px" strokeDasharray="1px 1px" style={{ transform: 'scale(-1)', transformOrigin: '412px 223.75px' }} />
            <path d="M412 263.5L412 184" stroke="url(#pink-pulse-1)" strokeLinecap="round" strokeWidth="2" />
          </g>
          
          {/* Orange pulse 2 */}
          <g>
            <path d="M508 96L508 88C508 85.7909 509.791 84 512 84L886 84C888.209 84 890 85.7909 890 88L890 264" stroke="var(--geist-foreground)" strokeOpacity="0.1" pathLength="1" strokeDashoffset="0px" strokeDasharray="1px 1px" />
            <path d="M508 96L508 88C508 85.7909 509.791 84 512 84L886 84C888.209 84 890 85.7909 890 88L890 264" stroke="url(#orange-pulse-2)" strokeWidth="2" />
          </g>
          
          <path d="M436 96L436 0" stroke="url(#paint1_linear_341_27683)" strokeOpacity="0.1" pathLength="1" strokeDashoffset="0px" strokeDasharray="1px 1px" />
          <path d="M436 214L436 184" stroke="var(--geist-foreground)" strokeOpacity="0.1" pathLength="1" strokeDashoffset="0px" strokeDasharray="1px 1px" style={{ transform: 'scale(-1)', transformOrigin: '436px 199px' }} />
          <path d="M460 96L460 64" stroke="var(--geist-foreground)" strokeOpacity="0.1" pathLength="1" strokeDashoffset="0px" strokeDasharray="1px 1px" />
          <path d="M460 239L460 184" stroke="var(--geist-foreground)" strokeOpacity="0.1" pathLength="1" strokeDashoffset="0px" strokeDasharray="1px 1px" style={{ transform: 'scale(-1)', transformOrigin: '460px 211.5px' }} />
          <path d="M484 96L484 24C484 21.7909 485.791 20 488 20L554 20" stroke="url(#paint2_linear_341_27683)" strokeOpacity="0.1" pathLength="1" strokeDashoffset="0px" strokeDasharray="1px 1px" />
          <path d="M484 184L484 210C484 212.209 485.791 214 488 214L560 214" stroke="var(--geist-foreground)" strokeOpacity="0.1" pathLength="1" strokeDashoffset="0px" strokeDasharray="1px 1px" />
          <path d="M508 184L508 193C508 195.209 509.791 197 512 197L560 197" stroke="var(--geist-foreground)" strokeOpacity="0.1" pathLength="1" strokeDashoffset="0px" strokeDasharray="1px 1px" />
          
          {/* Connector circles */}
          <circle cx="460" cy="64" fill="var(--geist-background)" r="4" opacity="1" />
          <circle cx="460" cy="64" r="3.5" stroke="var(--geist-foreground)" strokeOpacity="0.1" opacity="1" />
          <circle cx="308" cy="64" fill="var(--geist-background)" r="4" opacity="1" />
          <circle cx="308" cy="64" r="3.5" stroke="var(--geist-foreground)" strokeOpacity="0.1" opacity="1" />
          <circle cx="69" cy="173" fill="var(--geist-background)" r="4" opacity="1" />
          <circle cx="69" cy="173" r="3.5" stroke="var(--geist-foreground)" strokeOpacity="0.1" opacity="1" />
          <circle cx="436" cy="214" fill="var(--geist-background)" r="4" opacity="1" />
          <circle cx="436" cy="214" r="3.5" stroke="var(--geist-foreground)" strokeOpacity="0.1" opacity="1" />
          <circle cx="460" cy="240" fill="var(--geist-background)" r="4" opacity="1" />
          <circle cx="460" cy="240" r="3.5" stroke="var(--geist-foreground)" strokeOpacity="0.1" opacity="1" />
          <circle cx="560" cy="214" fill="var(--geist-background)" r="4" opacity="1" />
          <circle cx="560" cy="214" r="3.5" stroke="var(--geist-foreground)" strokeOpacity="0.1" opacity="1" />
          <circle cx="560" cy="197" fill="var(--geist-background)" r="4" opacity="1" />
          <circle cx="560" cy="197" r="3.5" stroke="var(--geist-foreground)" strokeOpacity="0.1" opacity="1" />
          
          {/* Gradient definitions */}
          <defs>
            <linearGradient gradientUnits="userSpaceOnUse" id="paint0_linear_341_27683" x1="412.5" x2="412.5" y1="-3.27835e-08" y2="96">
              <stop stopOpacity="0" />
              <stop offset="1" />
            </linearGradient>
            <linearGradient gradientUnits="userSpaceOnUse" id="paint1_linear_341_27683" x1="436.5" x2="436.5" y1="-3.27835e-08" y2="96">
              <stop stopOpacity="0" />
              <stop offset="1" />
            </linearGradient>
            <linearGradient gradientUnits="userSpaceOnUse" id="paint2_linear_341_27683" x1="554" x2="484" y1="20" y2="96">
              <stop stopOpacity="0" />
              <stop offset="1" />
            </linearGradient>
            
            {/* Animated gradients */}
            <linearGradient gradientUnits="userSpaceOnUse" id="blue-pulse-1" ref={bluePulse1Ref}>
              <stop stopColor="#2EB9DF" stopOpacity="0" />
              <stop offset="0.05" stopColor="#2EB9DF" />
              <stop offset="1" stopColor="#2EB9DF" stopOpacity="0" />
            </linearGradient>
            <linearGradient gradientUnits="userSpaceOnUse" id="blue-pulse-2" ref={bluePulse2Ref}>
              <stop stopColor="#2EB9DF" stopOpacity="0" />
              <stop offset="0.05" stopColor="#2EB9DF" />
              <stop offset="1" stopColor="#2EB9DF" stopOpacity="0" />
            </linearGradient>
            <linearGradient gradientUnits="userSpaceOnUse" id="pink-pulse-1" ref={pinkPulse1Ref}>
              <stop stopColor="#FF4A81" stopOpacity="0" />
              <stop offset="0.030" stopColor="#FF4A81" />
              <stop offset="0.27" stopColor="#DF6CF6" />
              <stop offset="1" stopColor="#0196FF" stopOpacity="0" />
            </linearGradient>
            <linearGradient gradientUnits="userSpaceOnUse" id="pink-pulse-2" ref={pinkPulse2Ref}>
              <stop stopColor="#FF4A81" stopOpacity="0" />
              <stop offset="0.0564843" stopColor="#FF4A81" />
              <stop offset="0.4616" stopColor="#DF6CF6" />
              <stop offset="1" stopColor="#0196FF" stopOpacity="0" />
            </linearGradient>
            <linearGradient gradientUnits="userSpaceOnUse" id="orange-pulse-1" ref={orangePulse1Ref}>
              <stop stopColor="#FF7432" stopOpacity="0" />
              <stop offset="0.0550784" stopColor="#FF7432" />
              <stop offset="0.373284" stopColor="#F7CC4B" />
              <stop offset="1" stopColor="#F7CC4B" stopOpacity="0" />
            </linearGradient>
            <linearGradient gradientUnits="userSpaceOnUse" id="orange-pulse-2" ref={orangePulse2Ref}>
              <stop stopColor="#FF7432" stopOpacity="0" />
              <stop offset="0.0531089" stopColor="#FF7432" />
              <stop offset="0.415114" stopColor="#F7CC4B" />
              <stop offset="1" stopColor="#F7CC4B" stopOpacity="0" />
            </linearGradient>
          </defs>
        </StyledSVG>
      </SVGContainer>
      
      <CpuComponent />
      
      <CardsContainer>
        <TechnologyCard 
          icon="react"
          title="React"
          subtitle="The library for web and native user interfaces. Next.js is built on the latest React features, including Server Components and Actions."
          url="https://react.dev"
          color="#149ECA"
        />
        <TechnologyCard 
          icon="turbo"
          title="Turbopack"
          subtitle="An incremental bundler optimized for JavaScript and TypeScript, written in Rust, and built into Next.js."
          url="https://turbo.build"
          gradient="linear-gradient(90deg, #0096FF, #FF1E56)"
        />
        <TechnologyCard 
          icon="swc"
          title="Speedy Web Compiler"
          subtitle="An extensible Rust based platform for the next generation of fast developer tools, and can be used for both compilation and minification."
          url="https://swc.rs"
        />
      </CardsContainer>
    </IllustrationContainer>
  )
}

export default FoundationIllustration