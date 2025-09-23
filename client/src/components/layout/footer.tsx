import { Link } from "wouter";
import { Mail, Github, Info, FileText, ExternalLink } from "lucide-react";
import obtvLogo from "../../assets/obtv_logo_1758612025082.png";

export default function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="w-full bg-gray-50 dark:bg-[#0a0d14] border-t border-gray-200 dark:border-gray-900">
      <div className="container px-6 mx-auto py-0">
        <div className="flex flex-col items-center space-y-0">
          {/* Centered OBTV Logo */}
          <div className="flex items-center justify-center">
            <img 
              src={obtvLogo} 
              alt="OBTV Logo" 
              className="block h-8 w-auto"
              data-testid="footer-obtv-logo"
            />
          </div>
          
          {/* Copyright and Links Row */}
          <div className="flex flex-col md:flex-row justify-between items-center w-full">
            <div className="flex items-center mb-0">
              <span className="text-xs leading-none text-gray-500 dark:text-gray-300">
                &copy; {currentYear} Obviu.io
              </span>
            </div>
            
            <div className="flex flex-wrap justify-center gap-x-6">
            <Link href="/about">
              <span className="text-xs text-gray-500 dark:text-gray-300 hover:text-primary-500 dark:hover:text-primary-400 transition-colors cursor-pointer flex items-center">
                <Info className="h-3 w-3 mr-1" />
                About
              </span>
            </Link>
            <Link href="/privacy">
              <span className="text-xs text-gray-500 dark:text-gray-300 hover:text-primary-500 dark:hover:text-primary-400 transition-colors cursor-pointer flex items-center">
                <FileText className="h-3 w-3 mr-1" />
                Privacy
              </span>
            </Link>
            <Link href="/terms">
              <span className="text-xs text-gray-500 dark:text-gray-300 hover:text-primary-500 dark:hover:text-primary-400 transition-colors cursor-pointer flex items-center">
                <FileText className="h-3 w-3 mr-1" />
                Terms
              </span>
            </Link>
            <Link href="/contact">
              <span className="text-xs text-gray-500 dark:text-gray-300 hover:text-primary-500 dark:hover:text-primary-400 transition-colors cursor-pointer flex items-center">
                <Mail className="h-3 w-3 mr-1" />
                Contact
              </span>
            </Link>
            <a 
              href="https://github.com/obviu/obviu" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-gray-500 dark:text-gray-300 hover:text-primary-500 dark:hover:text-primary-400 transition-colors flex items-center"
            >
              <Github className="h-3 w-3 mr-1" />
              GitHub
            </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}