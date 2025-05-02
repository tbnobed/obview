import { Link } from "wouter";
import Logo from "@/components/ui/logo";
import { ExternalLink, Mail, Github } from "lucide-react";

export default function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="w-full py-6 bg-neutral-50 border-t border-neutral-200">
      <div className="container px-6 mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center mb-4 md:mb-0">
            <Logo size="sm" withText={true} className="text-primary-500" />
            <span className="text-sm text-neutral-500 ml-2">
              &copy; {currentYear} OBview.io
            </span>
          </div>
          
          <div className="flex flex-wrap justify-center gap-x-8">
            <Link href="/about">
              <span className="text-sm text-neutral-600 hover:text-primary-600 transition-colors cursor-pointer">
                About
              </span>
            </Link>
            <Link href="/privacy">
              <span className="text-sm text-neutral-600 hover:text-primary-600 transition-colors cursor-pointer">
                Privacy Policy
              </span>
            </Link>
            <Link href="/terms">
              <span className="text-sm text-neutral-600 hover:text-primary-600 transition-colors cursor-pointer">
                Terms of Service
              </span>
            </Link>
            <a 
              href="mailto:contact@obview.io" 
              className="text-sm text-neutral-600 hover:text-primary-600 transition-colors flex items-center"
            >
              <Mail className="h-3.5 w-3.5 mr-1" />
              Contact
            </a>
            <a 
              href="https://github.com/obview/obview" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-neutral-600 hover:text-primary-600 transition-colors flex items-center"
            >
              <Github className="h-3.5 w-3.5 mr-1" />
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}