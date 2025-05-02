import React from 'react';
import logoImage from '../../assets/logo.png';
import { Link } from 'wouter';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  withText?: boolean; // Keep for backward compatibility
}

const Logo: React.FC<LogoProps> = ({ className = '', size = 'md' }) => {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12'
  };

  return (
    <Link href="/">
      <div className={`flex items-center cursor-pointer ${className}`}>
        <img 
          src={logoImage} 
          alt="OBview.io" 
          className={`${sizeClasses[size]} object-contain drop-shadow-[0_0_10px_rgba(20,184,166,0.6)]`} 
        />
      </div>
    </Link>
  );
};

export default Logo;