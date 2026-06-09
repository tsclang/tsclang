#include "runtime.h"

int main(void) {
    TSC_INIT();
    opt_string s = {true, STR_LIT("hi")};
    while (s.has_value && s.value.length > 0) {
        printf("%s\n", s.has_value ? s.value.data : "null");
        s = (opt_string){false, 0};
    }
    printf("done\n");
    return 0;
}
