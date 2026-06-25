#include "runtime.h"

typedef struct { bool has_value; int32_t value; } opt_i32;

int main(void) {
    TSC_INIT();
    opt_i32 x = {false, 0};
    printf("%s\n", x.has_value ? "some" : "null");
    return 0;
}
