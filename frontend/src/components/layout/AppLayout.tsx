import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';


export default function AppLayout() {
    return (
        <div className="flex bg-background min-h-screen">
            <Sidebar />
            <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
                <Header />
                <main className="flex-1 overflow-y-auto p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
