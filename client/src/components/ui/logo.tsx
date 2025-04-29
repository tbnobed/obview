import React from 'react';
import logoImage from '../../assets/logo.png';
import { Link } from 'wouter';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  withText?: boolean;
}

const Logo: React.FC<LogoProps> = ({ className = '', size = 'md', withText = true }) => {
  const sizeClasses = {
    sm: 'h-24 w-24',
    md: 'h-36 w-36',
    lg: 'h-48 w-48'
  };

  return (
    <Link href="/">
      <div className={`flex items-center space-x-4 md:space-x-6 cursor-pointer ${className}`}>
        <img 
          src={logoImage} 
          alt="OBview.io" 
          className={`${sizeClasses[size]} object-contain drop-shadow-[0_0_15px_rgba(20,184,166,0.5)]`} 
        />
        {withText && (
          <span className="font-bold text-3xl md:text-4xl lg:text-5xl bg-gradient-to-r from-teal-500 to-teal-700 bg-clip-text text-transparent">
            OBview.io
          </span>
        )}
      </div>
    </Link>
  );
};

export default Logo;