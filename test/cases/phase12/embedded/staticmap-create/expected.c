#include "runtime.h"
#include "std/embedded.h"

typedef struct { bool has_value; int32_t value; } opt_i32;

static opt_i32 _staticmap_0_get(String key) {
    uint32_t _h = tsc_djb2(key);
    switch (_h % 3) {
        case 2: if (tsc_string_eq(key, STR_LIT("LDA"))) return (opt_i32){true, 0xA9}; if (tsc_string_eq(key, STR_LIT("STA"))) return (opt_i32){true, 0x8D}; break;
        case 1: if (tsc_string_eq(key, STR_LIT("LDX"))) return (opt_i32){true, 0xA2}; break;
    }
    return (opt_i32){false, 0};
}

int main(void) {
    TSC_INIT();
    opt_i32 v = _staticmap_0_get(STR_LIT("STA"));
    if (v.has_value) printf("%d\n", v.value);
    return 0;
}
