import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Product {
  id: string;
  name: string;
  stock_quantity: number;
  reorder_level: number;
  category: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all products with low stock
    const { data: products, error: productsError } = await supabase
      .from("products_master")
      .select("*");

    if (productsError) throw productsError;

    const lowStockProducts = (products as Product[]).filter(
      (p) => p.stock_quantity <= p.reorder_level
    );

    if (lowStockProducts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No low stock alerts", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get users with low stock alert preferences enabled
    const { data: preferences, error: prefsError } = await supabase
      .from("notification_preferences")
      .select("user_id, email_notifications, phone_number")
      .eq("low_stock_alerts", true)
      .eq("email_notifications", true);

    if (prefsError) throw prefsError;

    if (!preferences || preferences.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: "No users subscribed to alerts", 
          lowStockCount: lowStockProducts.length 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user emails
    const userIds = preferences.map(p => p.user_id);
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers();
    
    if (usersError) throw usersError;

    const notificationResults = {
      sent: 0,
      failed: 0,
      lowStockCount: lowStockProducts.length
    };

    // Log the alert (could be extended to send actual emails via Resend)
    console.log(`Low stock alert: ${lowStockProducts.length} products need restocking`);
    console.log(`Would notify ${preferences.length} users`);

    lowStockProducts.forEach(product => {
      console.log(`- ${product.name}: ${product.stock_quantity} left (reorder at ${product.reorder_level})`);
    });

    return new Response(
      JSON.stringify({ 
        message: "Low stock alerts processed",
        ...notificationResults,
        products: lowStockProducts.map(p => ({
          name: p.name,
          stock: p.stock_quantity,
          reorder: p.reorder_level
        }))
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  } catch (error: any) {
    console.error("Error sending low stock alerts:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
