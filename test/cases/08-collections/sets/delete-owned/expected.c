#include "runtime.h"

int main(void) {
    TSC_INIT();
    TscSet_i32 s = tsc_set_create_i32();
    tsc_set_add_i32(&s, 42);
    tsc_set_add_i32(&s, 10);
    bool removed = tsc_set_delete_i32(&s, 42);
    if (removed) {
        printf("deleted\n");
    }
    printf("%zu\n", s.size);
    return 0;
}
