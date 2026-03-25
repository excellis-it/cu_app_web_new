'use client'
import { usePathname, useRouter } from 'next/navigation';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthContextWrapper } from './authContext';
import { Loader } from 'rizzui';

const AppContext = createContext({} as any);

export const AppContextWrapper = ({ children }: { children: any }) => {
    const [loading, setLoading] = useState(0);

    const router = useRouter();
    const path = usePathname();

    useEffect(() => {
        if (loading < 0) {
            setLoading(0)
        }
    }, [loading]);

    const isLoading = (status: boolean) => {
        if (status) setLoading((state: number) => state + 1);
        else setLoading((state: number) => state - 1);
    };
    const sharedStates = {
        isLoading,
    };


    return (
        <AppContext.Provider value={sharedStates}>
            <AuthContextWrapper>
                {loading > 0 &&
                    <div className="m-auto"> 
                        <Loader variant="spinner" size="xl" className="custom-loader"/>
                    </div>
                }
                {children}
            </AuthContextWrapper>
        </AppContext.Provider>
    );
};

export function useAppContext() {
    return useContext(AppContext);
}


