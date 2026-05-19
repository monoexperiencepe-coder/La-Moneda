import React from 'react';
import Header from './Header';
import Footer from './Footer';
import FloatingRegistrosMenu from '../FAB/FloatingRegistrosMenu';
import { DataBootstrapOverlay, PageTransition } from '../Loading';

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      <main className="relative flex-1 pt-16">
        <DataBootstrapOverlay />
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8">
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
      <Footer />

      <FloatingRegistrosMenu />
    </div>
  );
};

export default MainLayout;
