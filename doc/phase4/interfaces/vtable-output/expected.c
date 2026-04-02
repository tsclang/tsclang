#include "runtime.h"

typedef struct {
    void (*draw)(void *self);
} Drawable_vtable;

typedef struct {
    void *self;
    const Drawable_vtable *vtable;
} Drawable;

int main(void) {
    TSC_INIT();
    return 0;
}
