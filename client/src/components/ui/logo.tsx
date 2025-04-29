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
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-10 w-10'
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
          <span className="font-bold text-lg bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent">
            OBview.io
          </span>
        )}
      </div>
    </Link>
  );
};

export default Logo;