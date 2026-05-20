import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { canViewSection, permissionUserFromAuth, type AppSection } from '../../utils/permissions';
import RestrictedAccess from './RestrictedAccess';

type Props = {
  section: AppSection;
  children: React.ReactNode;
};

const SectionGuard: React.FC<Props> = ({ section, children }) => {
  const { user, profile } = useAuth();
  const pUser = permissionUserFromAuth(user, profile?.email ?? null);
  if (!canViewSection(pUser, section)) {
    return <RestrictedAccess user={pUser} />;
  }
  return <>{children}</>;
};

export default SectionGuard;
