import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Store, ChevronDown, Check, Plus, Building2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function ShopSwitcher() {
  const { activeShop, shops, switchShop, user } = useAuth();
  const navigate = useNavigate();
  const [switching, setSwitching] = useState(false);

  if (!activeShop) return null;

  const handleSwitch = async (shopId) => {
    if (shopId === activeShop.id) return;
    try {
      setSwitching(true);
      await switchShop(shopId);
    } catch (err) {
      console.error('Failed to switch shop:', err);
    } finally {
      setSwitching(false);
    }
  };

  const handleAddNewShop = () => {
    navigate('/onboarding');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1.5 rounded-lg border border-border/80 bg-background/80 hover:bg-muted/80 text-foreground transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-amber-500/20 max-w-[125px] sm:max-w-[200px] md:max-w-[240px] shrink min-w-0"
          disabled={switching}
          title="Switch Shop / Business"
        >
          <div className="w-5 h-5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Store className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold truncate tracking-tight text-left">
            {activeShop.shop_name || 'My Jewellery Shop'}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-auto opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-1.5 shadow-lg border-border">
        <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground px-2 py-1 uppercase tracking-wider">
          Jewellery Shops ({shops.length})
        </DropdownMenuLabel>
        
        <div className="max-h-56 overflow-y-auto space-y-0.5">
          {shops.map((s) => {
            const isActive = s.id === activeShop.id;
            return (
              <DropdownMenuItem
                key={s.id}
                onClick={() => handleSwitch(s.id)}
                className={`flex items-center justify-between px-2.5 py-2 rounded-md text-xs cursor-pointer ${
                  isActive ? 'bg-amber-500/10 text-amber-900 dark:text-amber-100 font-medium' : 'text-foreground'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-amber-600' : 'text-muted-foreground'}`} />
                  <div className="truncate">
                    <p className="truncate text-xs font-medium">{s.shop_name}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">{s.role || 'member'}</p>
                  </div>
                </div>
                {isActive && <Check className="w-4 h-4 text-amber-600 shrink-0 ml-2" />}
              </DropdownMenuItem>
            );
          })}
        </div>

        <DropdownMenuSeparator className="my-1" />

        <DropdownMenuItem
          onClick={handleAddNewShop}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-amber-600 dark:text-amber-400 font-medium cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-950/40"
        >
          <Plus className="w-3.5 h-3.5 shrink-0" />
          <span>+ Add New Jewellery Shop</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
