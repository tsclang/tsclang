#include "runtime.h"

typedef struct { bool has_value; int32_t value; } opt_i32;

int main(void) {
    TSC_INIT();
    opt_i32 x = {true, 42};
    if (x.has_value && x.value != 0) {
        printf("yes\n");
    } else {
        printf("no\n");
    }
    return 0;
}
