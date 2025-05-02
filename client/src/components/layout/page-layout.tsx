import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import Footer from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Home, LogIn } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ThemeToggle } from "@/components/theme-toggle";

interface PageLayoutProps {
  children: ReactNode;
}

export default function PageLayout({ children }: PageLayoutProps) {
  const [location] = useLocation();
  const { user } = useAuth();

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-[#0a0d14] text-foreground">
      {/* Simple Header */}
      <header className="bg-white dark:bg-[#0a0d14] shadow dark:shadow-none border-b border-gray-200 dark:border-gray-900">
        <div className="container mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <Link href="/">
              <div className="flex items-center cursor-pointer">
                <h1 className="text-xl font-bold bg-gradient-to-r from-primary-500 to-primary-700 dark:from-primary-400 dark:to-primary-600 bg-clip-text text-transparent">
                  Obviu.io
                </h1>
              </div>
            </Link>
            
            <div className="flex items-center space-x-3">
              <ThemeToggle />
              
              {user ? (
                <Button variant="outline" className="border-gray-200 dark:border-gray-800 dark:bg-gray-900/50 dark:text-gray-200 dark:hover:bg-gray-800" asChild>
                  <Link href="/">
                    <Home className="w-4 h-4 mr-2" />
                    Dashboard
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" className="border-gray-200 dark:border-gray-800 dark:bg-gray-900/50 dark:text-gray-200 dark:hover:bg-gray-800" asChild>
                  <Link href="/auth">
                    <LogIn className="w-4 h-4 mr-2" />
                    Sign In
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="flex-grow">
        {children}
      </main>
      
      {/* Footer */}
      <Footer />
    </div>
  );
}