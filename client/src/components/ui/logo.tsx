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
    sm: 'h-16 w-16',
    md: 'h-24 w-24',
    lg: 'h-32 w-32'
  };

  return (
    <Link href="/">
      <div className={`flex items-center space-x-2 cursor-pointer ${className}`}>
        <img 
          src={logoImage} 
          alt="OBview.io" 
          className={`${sizeClasses[size]} object-contain`} 
        />
        {withText && (
          <span className="font-bold text-xl md:text-2xl lg:text-3xl bg-gradient-to-r from-teal-500 to-teal-700 bg-clip-text text-transparent">
            OBview.io
          </span>
        )}
      </div>
    </Link>
  );
};

export default Logo;