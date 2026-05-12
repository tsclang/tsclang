#include "runtime.h"

typedef struct { bool has_value; int32_t value; } opt_i32;
typedef struct { String _0; opt_i32 _1; } Config;

int main(void) {
    TSC_INIT();
    return 0;
}
