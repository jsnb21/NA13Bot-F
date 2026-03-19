#!/usr/bin/env python3
"""
Debug script to check and fix color configurations for restaurants.
Use this to diagnose why fonts are displaying in wrong colors.
"""

from tools import (
    get_connection, get_db_schema, 
    _resolve_restaurant_id, _fetch_brand_settings
)
from psycopg import sql
import sys

def check_restaurant_colors(restaurant_id):
    """Check what colors are configured for a restaurant."""
    print(f"\n=== Checking colors for restaurant: {restaurant_id} ===\n")
    
    resolved_id = _resolve_restaurant_id(restaurant_id)
    if not resolved_id:
        print(f"❌ Could not resolve restaurant ID: {restaurant_id}")
        return
    
    try:
        settings = _fetch_brand_settings(resolved_id)
        print(f"Restaurant ID: {resolved_id}")
        print(f"Name: {settings.get('establishment_name', 'N/A')}")
        print(f"\nColor Configuration:")
        print(f"  main_color: {settings.get('main_color', 'not set')}")
        print(f"  main_foreground: {settings.get('main_foreground', 'not set')}")
        print(f"  sub_color: {settings.get('sub_color', 'not set')}")
        print(f"  sub_foreground: {settings.get('sub_foreground', 'not set')}")
        print(f"  text_primary: {settings.get('text_primary', 'not set')}")
        print(f"  text_secondary: {settings.get('text_secondary', 'not set')}")
        print(f"  font_color: {settings.get('font_color', 'not set')}")
        print(f"  color_hex: {settings.get('color_hex', 'not set')}")
        
        # Check for problematic values
        problematic = []
        if settings.get('font_color') and isinstance(settings.get('font_color'), str):
            if settings.get('font_color').lower() == 'red' or settings.get('font_color') == '#ff0000':
                problematic.append('font_color is set to RED')
        if settings.get('text_primary') and isinstance(settings.get('text_primary'), str):
            if settings.get('text_primary').lower() == 'red' or settings.get('text_primary') == '#ff0000':
                problematic.append('text_primary is set to RED')
        
        if problematic:
            print(f"\n⚠️  WARNING - Problematic Colors Found:")
            for issue in problematic:
                print(f"   - {issue}")
            return resolved_id
        else:
            print(f"\n✅ Colors look OK")
            return resolved_id
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def clear_problem_colors(restaurant_id):
    """Clear problematic color values from database."""
    resolved_id = _resolve_restaurant_id(restaurant_id)
    if not resolved_id:
        print(f"Could not resolve restaurant ID")
        return False
    
    schema = get_db_schema()
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Set problematic colors to NULL to use defaults
                cur.execute(
                    sql.SQL(
                        "UPDATE {}.brand_settings SET font_color = NULL, text_primary = NULL WHERE restaurant_id = %s"
                    ).format(sql.Identifier(schema)),
                    [resolved_id]
                )
                conn.commit()
                print(f"✅ Cleared font_color and text_primary for {restaurant_id}")
                return True
    except Exception as e:
        print(f"❌ Error clearing colors: {e}")
        return False

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python debug_colors.py <check|clear> <restaurant_id>")
        print("\nExample:")
        print("  python debug_colors.py check scotts-restaurant")
        print("  python debug_colors.py clear scotts-restaurant")
        sys.exit(1)
    
    action = sys.argv[1]
    rest_id = sys.argv[2] if len(sys.argv) > 2 else None
    
    if not rest_id:
        print("❌ Restaurant ID required")
        sys.exit(1)
    
    if action == 'check':
        resolved = check_restaurant_colors(rest_id)
    elif action == 'clear':
        check_restaurant_colors(rest_id)
        print("\n" + "="*50)
        print("Clearing problematic colors...")
        if clear_problem_colors(rest_id):
            print("\n✅ Done! Colors have been reset to defaults.")
            print("   Reload the chatbot page to see changes.")
        else:
            print("❌ Failed to clear colors")
    else:
        print(f"Unknown action: {action}")
        sys.exit(1)
