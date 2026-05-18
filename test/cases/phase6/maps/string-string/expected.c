#include "runtime.h"

typedef struct { bool has_value; String value; } opt_string;

int main(void) {
    TSC_INIT();
    TscMap_string_string m = tsc_map_create_string_string();
    tsc_map_set_string_string(&m, STR_LIT("name"), STR_LIT("Alice"));
    tsc_map_set_string_string(&m, STR_LIT("city"), STR_LIT("Wonderland"));
    printf("%s\n", tsc_map_get_string_string(&m, STR_LIT("name")).has_value ? tsc_map_get_string_string(&m, STR_LIT("name")).value.data : "null");
    printf("%zu\n", m.size);
    return 0;
}
