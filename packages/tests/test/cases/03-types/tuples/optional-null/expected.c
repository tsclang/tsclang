#include "runtime.h"

typedef struct { bool has_value; int32_t value; } opt_i32;
typedef struct { String _0; opt_i32 _1; } Config;

int main(void) {
    TSC_INIT();
    Config a = {._0 = STR_LIT("localhost"), ._1 = {false, 0}};
    printf("%s\n", a._1.has_value ? "some" : "null");
    return 0;
}
