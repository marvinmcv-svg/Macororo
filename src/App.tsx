import { lazy, Suspense, useEffect } from 'react';
import { useHashRoute } from './lib/hooks';
import Landing from './components/Landing';

const Explorer = lazy(() => import('./components/Explorer'));

export default function App() {
  const route = useHashRoute();
  useEffect(() => {
    if (route.page === 'home' && !window.location.hash.includes('#s-')) window.scrollTo(0, 0);
  }, [route.page]);
  if (route.page === 'explorar')
    return (
      <Suspense fallback={<div className="ex"><div className="ex-loading"><span className="mono dot">Cargando explorador 3D</span></div></div>}>
        <Explorer params={route.params} />
      </Suspense>
    );
  return <Landing />;
}
