import React from 'react';
import Header from './Header';
import Footer from './Footer';
import FloatingRegistrosMenu from '../FAB/FloatingRegistrosMenu';

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      <main className="flex-1 pt-16">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8">
          {children}
        </div>
      </main>
      <Footer />

      <FloatingRegistrosMenu />
    </div>
  );
};

export default MainLayout;
