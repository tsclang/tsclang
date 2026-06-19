#include "runtime.h"

typedef struct { bool has_value; int32_t value; } opt_i32;

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("xyz");
    const opt_i32 n = tsc_try_parse_i32(s);
    if (!n.has_value) {
        printf("null\n");
    }
    tsc_string_release(s);
    return 0;
}
