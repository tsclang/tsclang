#include "runtime.h"

typedef struct { bool has_value; int32_t value; } opt_i32;

int main(void) {
    TSC_INIT();
    opt_i32 x = {false, 0};
    String msg;
    if (!x.has_value) { msg = STR_LIT("nothing"); }
    else { msg = STR_LIT("value"); }
    printf("%s\n", msg.data);
    return 0;
}
