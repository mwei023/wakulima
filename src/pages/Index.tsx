import { useStore } from '@/store/useStore';
import { Layout } from '@/components/Layout';
import { LoginForm } from '@/components/Auth/LoginForm';

const Index = () => {
  const isAuthenticated = useStore(state => state.isAuthenticated);
  
  if (!isAuthenticated) {
    return <LoginForm />;
  }
  
  return <Layout />;
};

export default Index;
