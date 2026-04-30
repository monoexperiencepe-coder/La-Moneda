import React from 'react';
import Header from './Header';
import Footer from './Footer';
import FloatingActionButton from '../FAB/FloatingActionButton';
import QuickIncomeDrawer from '../Drawers/QuickIncomeDrawer';
import QuickExpenseDrawer from '../Drawers/QuickExpenseDrawer';
import QuickMaintenanceDrawer from '../Drawers/QuickMaintenanceDrawer';
import QuickDocumentationDrawer from '../Drawers/QuickDocumentationDrawer';
import QuickDiscountDrawer from '../Drawers/QuickDiscountDrawer';

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

      {/* FAB always visible */}
      <FloatingActionButton />

      {/* Drawers */}
      <QuickIncomeDrawer />
      <QuickExpenseDrawer />
      <QuickDiscountDrawer />
      <QuickMaintenanceDrawer />
      <QuickDocumentationDrawer />
    </div>
  );
};

export default MainLayout;
