import { Link } from "wouter";
import { Mail, Github, Info, FileText, ExternalLink } from "lucide-react";

export default function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="w-full py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
      <div className="container px-6 mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center mb-3 md:mb-0">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              &copy; {currentYear} Obviu.io
            </span>
          </div>
          
          <div className="flex flex-wrap justify-center gap-x-6">
            <Link href="/about">
              <span className="text-xs text-gray-500 dark:text-gray-400 hover:text-primary-500 dark:hover:text-primary-400 transition-colors cursor-pointer flex items-center">
                <Info className="h-3 w-3 mr-1" />
                About
              </span>
            </Link>
            <Link href="/privacy">
              <span className="text-xs text-gray-500 dark:text-gray-400 hover:text-primary-500 dark:hover:text-primary-400 transition-colors cursor-pointer flex items-center">
                <FileText className="h-3 w-3 mr-1" />
                Privacy
              </span>
            </Link>
            <Link href="/terms">
              <span className="text-xs text-gray-500 dark:text-gray-400 hover:text-primary-500 dark:hover:text-primary-400 transition-colors cursor-pointer flex items-center">
                <FileText className="h-3 w-3 mr-1" />
                Terms
              </span>
            </Link>
            <Link href="/contact">
              <span className="text-xs text-gray-500 dark:text-gray-400 hover:text-primary-500 dark:hover:text-primary-400 transition-colors cursor-pointer flex items-center">
                <Mail className="h-3 w-3 mr-1" />
                Contact
              </span>
            </Link>
            <a 
              href="https://github.com/obviu/obviu" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-primary-500 dark:hover:text-primary-400 transition-colors flex items-center"
            >
              <Github className="h-3 w-3 mr-1" />
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}